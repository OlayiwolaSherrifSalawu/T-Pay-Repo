// backend/src/server.ts
import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import cors from 'cors';
import express from 'express';
import { apiRouter } from './routes/api.routes';
import { loadConfig } from './v1/config';
import { RestPayPalGateway } from './v1/paypal';
import { createV1Router } from './v1/routes';
import { SettlementService } from './v1/settlement';
import { Store } from './v1/store';

const SWEEP_INTERVAL_MS = 15_000;

const config = loadConfig();
if (config.databasePath !== ':memory:') {
  mkdirSync(dirname(config.databasePath), { recursive: true });
}

const store = new Store(config.databasePath);
const gateway = config.paypal
  ? new RestPayPalGateway(
      config.paypal.clientId,
      config.paypal.clientSecret,
      config.paypal.webhookId
    )
  : null;
const settlement = new SettlementService(store, gateway, {
  fxNgnPerUsd: config.fxNgnPerUsd,
  fxSource: config.fxSource,
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/v1', createV1Router(settlement, gateway, config.appUrl));
app.use('/api', apiRouter);

app.listen(config.port, () => {
  console.log(`🚀 Backend server listening on http://localhost:${config.port}`);
  if (!gateway) console.warn('PayPal is not configured: vault and settlement calls will return 503.');
});

if (gateway) {
  setInterval(() => {
    settlement.sweep().catch((error) => console.error('[sweep] failed', error));
  }, SWEEP_INTERVAL_MS);
}
