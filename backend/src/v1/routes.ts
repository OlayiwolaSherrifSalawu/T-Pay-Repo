import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { PayPalGateway } from './paypal';
import { PayPalError } from './paypal';
import { ApiError, type SettlementService } from './settlement';
import type { DeviceRow } from './store';

type AuthedHandler = (device: DeviceRow, req: Request, res: Response) => Promise<unknown>;

function bearerToken(req: Request) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

export function createV1Router(
  service: SettlementService,
  gateway: PayPalGateway | null,
  appUrl: string
) {
  const router = Router();

  const handle =
    (work: (req: Request, res: Response) => Promise<unknown>, status = 200): RequestHandler =>
    (req, res, next) => {
      work(req, res)
        .then((data) => {
          if (!res.headersSent) res.status(status).json({ data });
        })
        .catch(next);
    };

  const authed = (work: AuthedHandler, status = 200) =>
    handle(async (req, res) => work(service.authenticate(bearerToken(req)), req, res), status);

  router.get(
    '/health',
    handle(async () => ({
      status: 'ok',
      paypal: gateway ? ((await gateway.isReachable()) ? 'reachable' : 'unreachable') : 'not_configured',
      environment: 'sandbox',
    }))
  );

  router.get('/issuer-key', handle(async () => ({ publicKey: await service.issuerPublicKey() })));

  router.post('/devices/register', handle((req) => service.registerDevice(req.body), 201));

  router.post(
    '/vaults',
    authed((device, req) => service.createVault(device, req.body.amountNgnMinor, appUrl), 201)
  );
  router.get('/vaults/current', authed(async (device) => service.currentVault(device)));
  router.post(
    '/vaults/:id/authorize',
    authed((device, req) => service.authorizeVault(device, req.params.id))
  );
  router.post(
    '/vaults/:id/melt',
    authed((device, req) => service.meltVault(device, req.params.id, req.body.lastIssuedSequence))
  );

  router.post('/vouchers', authed((device, req) => service.submitVoucher(device, req.body)));
  router.get('/vouchers', authed(async (device) => service.listVouchers(device)));
  router.get('/vouchers/:id', authed(async (device, req) => service.getVoucher(device, req.params.id)));
  router.get('/ledger', authed(async (device) => service.ledger(device)));

  router.post(
    '/webhooks/paypal',
    handle(async (req) => {
      await service.handleWebhook(req.headers as Record<string, string | undefined>, req.body);
      return { received: true };
    })
  );

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof PayPalError) {
      res.status(502).json({ error: { code: error.issue, message: error.message } });
      return;
    }
    console.error('[api] unexpected failure', error);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  return router;
}
