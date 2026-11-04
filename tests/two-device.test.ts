import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { validateProposal, type AssistantModel } from '../backend/src/v1/assistant';
import type { PayPalGateway } from '../backend/src/v1/paypal';
import { createV1Router } from '../backend/src/v1/routes';
import { SettlementService } from '../backend/src/v1/settlement';
import { Store } from '../backend/src/v1/store';
import { Wallet, WalletError, type KeyValueStore } from '../src/tpay/wallet';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.values.get(key) as T | undefined;
  }
  async set(key: string, value: unknown) {
    this.values.set(key, value);
  }
}

function stubGateway() {
  const captures: { voucherId: string; captureId: string }[] = [];
  const voided: string[] = [];
  const gateway: PayPalGateway = {
    createAuthorizeOrder: async () => ({ orderId: randomUUID(), approveUrl: 'https://paypal.test' }),
    authorizeOrder: async () => ({ authorizationId: `AUTH-${randomUUID()}` }),
    captureAuthorization: async ({ voucherId }) => {
      const captureId = `CAP-${randomUUID()}`;
      captures.push({ voucherId, captureId });
      return { captureId, status: 'COMPLETED' };
    },
    findCapture: async () => null,
    voidAuthorization: async (id) => {
      voided.push(id);
    },
    verifyWebhook: async () => true,
    isReachable: async () => true,
  };
  return { gateway, captures, voided };
}

async function startServer(assistant: AssistantModel | null = null) {
  const { gateway, captures, voided } = stubGateway();
  const service = new SettlementService(new Store(':memory:'), gateway, {
    fxNgnPerUsd: 1500,
    fxSource: 'test-fixed',
  });
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createV1Router(service, gateway, 'https://app.test', assistant));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  /** A device whose network can be switched off, as in the demo. */
  const device = () => {
    const link = { online: true };
    const fetcher: typeof fetch = (...args) =>
      link.online ? fetch(...args) : Promise.reject(new TypeError('Network is offline'));
    return { wallet: new Wallet(new MemoryStore(), baseUrl, fetcher), link };
  };

  return { server, device, captures, voided };
}

async function lockedPayer(start: Awaited<ReturnType<typeof startServer>>) {
  const payer = start.device();
  await payer.wallet.register();
  const { vaultId } = await payer.wallet.lockVault(1_500_000);
  await payer.wallet.completeVault(vaultId);
  return payer;
}

test('the full offline payment, end to end, across two devices', async (t) => {
  const start = await startServer();
  t.after(() => start.server.close());

  const payer = await lockedPayer(start);
  const payee = start.device();
  await payee.wallet.register();

  // Both devices lose the network.
  payer.link.online = false;
  payee.link.online = false;

  const voucher = await payer.wallet.pay(payee.wallet.deviceId, 300_000, 'coke');
  const received = await payee.wallet.receive(JSON.parse(JSON.stringify(voucher)));
  assert.equal(received.status, 'PENDING_CREDIT');
  assert.equal((await payer.wallet.listVouchers())[0].status, 'SIGNED');

  // A second payment bigger than what is left is refused before a signature exists.
  await assert.rejects(
    payer.wallet.pay(payee.wallet.deviceId, 1_300_000, 'too much'),
    (error) => error instanceof WalletError && error.code === 'OVER_CAPACITY'
  );
  assert.equal((await payer.wallet.listVouchers()).length, 1);

  // Only the payee reconnects, and settlement needs nothing from the payer.
  payee.link.online = true;
  await payee.wallet.sync();
  const settled = (await payee.wallet.listVouchers())[0];
  assert.equal(settled.status, 'SETTLED');
  assert.equal(start.captures.length, 1);
  assert.equal((await payee.wallet.ledger()).balanceNgnMinor, 300_000);

  // The payer reconnects later, and learns the same capture ID with no second capture.
  payer.link.online = true;
  await payer.wallet.sync();
  const payerView = (await payer.wallet.listVouchers())[0];
  assert.equal(payerView.status, 'SETTLED');
  assert.equal(payerView.captureId, settled.captureId);
  assert.equal(start.captures.length, 1);

  // Melting releases the remainder at PayPal, not merely in the app.
  await payer.wallet.meltVault();
  assert.equal(start.voided.length, 1);
});

test('a tampered voucher never shows as money received', async (t) => {
  const start = await startServer();
  t.after(() => start.server.close());
  const payer = await lockedPayer(start);
  const payee = start.device();
  await payee.wallet.register();

  const voucher = await payer.wallet.pay(payee.wallet.deviceId, 150_000, 'coke');
  voucher.payload.amountNgnMinor = 900_000;
  await assert.rejects(
    payee.wallet.receive(voucher),
    (error) => error instanceof WalletError && error.code === 'SIGNATURE_INVALID'
  );
  assert.equal((await payee.wallet.listVouchers()).length, 0);
});

test('a voucher made out to someone else cannot be taken', async (t) => {
  const start = await startServer();
  t.after(() => start.server.close());
  const payer = await lockedPayer(start);
  const intended = start.device();
  const thief = start.device();
  await intended.wallet.register();
  await thief.wallet.register();

  const voucher = await payer.wallet.pay(intended.wallet.deviceId, 150_000, 'coke');
  await assert.rejects(
    thief.wallet.receive(voucher),
    (error) => error instanceof WalletError && error.code === 'WRONG_PAYEE'
  );
});

test('the API refuses callers with no device token', async (t) => {
  const start = await startServer();
  t.after(() => start.server.close());
  const { port } = start.server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/vouchers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 401);
});

const CONTEXT = { language: 'pidgin' as const, vaultRemainingNgn: 5000, inventory: [] };

test('a model payment above the vault is rejected before signing', () => {
  const verdict = validateProposal(
    { action: 'PAY', amountNgn: 5001, payeeName: 'Mama Nkechi', item: null, reply: 'ok' },
    CONTEXT
  );
  assert.equal(verdict.allowed, false);
});

test('a model payment with no vault is rejected', () => {
  const verdict = validateProposal(
    { action: 'PAY', amountNgn: 100, payeeName: 'x', item: null, reply: 'ok' },
    { ...CONTEXT, vaultRemainingNgn: null }
  );
  assert.equal(verdict.allowed, false);
});

test('malformed model output cannot become an action', () => {
  for (const raw of [null, 'pay everything', { action: 'WIRE_ALL', amountNgn: 1 }]) {
    assert.equal(validateProposal(raw, CONTEXT).proposal.action, 'UNKNOWN');
  }
  const fractional = validateProposal({ action: 'PAY', amountNgn: 10.5, reply: '' }, CONTEXT);
  assert.equal(fractional.allowed, false);
});

test('a payment within the vault is allowed through as a proposal', async (t) => {
  const model: AssistantModel = {
    interpret: async () => ({
      action: 'PAY',
      amountNgn: 2000,
      payeeName: 'Mama Nkechi',
      item: null,
      reply: 'You wan send ₦2,000 give Mama Nkechi?',
    }),
  };
  const start = await startServer(model);
  t.after(() => start.server.close());
  const payer = await lockedPayer(start);

  const result = await payer.wallet.interpret('send 2k give mama nkechi', 'pidgin', []);
  assert.equal(result.allowed, true);
  assert.equal(result.proposal.amountNgn, 2000);
  assert.equal(start.captures.length, 0, 'interpreting must never move money');
});
