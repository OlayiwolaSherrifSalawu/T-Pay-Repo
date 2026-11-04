import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PayPalError, classifyFailure, usdValue, type PayPalGateway } from '../backend/src/v1/paypal';
import { ApiError, SettlementService } from '../backend/src/v1/settlement';
import { Store } from '../backend/src/v1/store';
import {
  exportPublicKey,
  generateKeyPair,
  keyIdOf,
  signRegistration,
  signVoucher,
  toUsdMinor,
  type SignedVoucher,
  type VaultCertificate,
} from '../core/voucher/voucher';

/** Records captures the way PayPal would, so tests assert on what actually left the system. */
class StubGateway implements PayPalGateway {
  public captures: { voucherId: string; amountUsdMinor: number; captureId: string }[] = [];
  public voided: string[] = [];
  public failNext: (() => Error)[] = [];
  public webhookValid = true;
  /** When set, the capture lands at PayPal and the response is lost on the way back. */
  public loseResponse = false;
  public delayMs = 0;
  public nextCaptureStatus: 'COMPLETED' | 'PENDING' = 'COMPLETED';

  async createAuthorizeOrder() {
    return { orderId: `ORDER-${randomUUID()}`, approveUrl: 'https://paypal.test/approve' };
  }
  async authorizeOrder() {
    return { authorizationId: `AUTH-${randomUUID()}` };
  }
  async captureAuthorization(input: { amountUsdMinor: number; voucherId: string }) {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const failure = this.failNext.shift();
    if (failure) throw failure();
    const captureId = `CAP-${randomUUID()}`;
    this.captures.push({ ...input, captureId });
    if (this.loseResponse) {
      this.loseResponse = false;
      throw new PayPalError('AMBIGUOUS', 'NETWORK_ERROR', 'timed out');
    }
    const status = this.nextCaptureStatus;
    this.nextCaptureStatus = 'COMPLETED';
    return { captureId, status };
  }
  async findCapture(_orderId: string, voucherId: string) {
    const match = this.captures.find((capture) => capture.voucherId === voucherId);
    return match ? { captureId: match.captureId, status: 'COMPLETED' as const } : null;
  }
  async voidAuthorization(authorizationId: string) {
    this.voided.push(authorizationId);
  }
  async verifyWebhook() {
    return this.webhookValid;
  }
  async isReachable() {
    return true;
  }
}

const NGN_PER_USD = 1500;
const RATE = NGN_PER_USD * 100;

async function setup() {
  const store = new Store(':memory:');
  const gateway = new StubGateway();
  let clock = new Date('2026-11-05T10:00:00.000Z');
  const service = new SettlementService(store, gateway, {
    fxNgnPerUsd: NGN_PER_USD,
    fxSource: 'test-fixed',
    now: () => clock,
    random: () => 0.5,
  });

  const device = async () => {
    const keys = await generateKeyPair();
    const publicKey = await exportPublicKey(keys.publicKey);
    const issuedAt = clock.toISOString();
    const proof = await signRegistration(keys.privateKey, await keyIdOf(publicKey), issuedAt);
    const registered = await service.registerDevice({ publicKey, issuedAt, proof });
    return { keys, ...registered, row: service.authenticate(registered.token) };
  };

  const payer = await device();
  const payee = await device();
  const otherPayee = await device();

  /** ₦15,000 is a $10.00 vault. */
  const lockVault = async () => {
    const { vaultId } = await service.createVault(payer.row, 1_500_000, 'https://app.test');
    const vault = await service.authorizeVault(payer.row, vaultId);
    return { vaultId, certificate: vault.certificate as VaultCertificate };
  };

  const sign = async (
    certificate: VaultCertificate,
    sequence: number,
    amountNgnMinor: number,
    payeeDeviceId = payee.deviceId,
    voucherId: string = randomUUID()
  ): Promise<SignedVoucher> => {
    const payload = {
      voucherId,
      vaultId: certificate.payload.vaultId,
      deviceId: payer.deviceId,
      keyId: payer.keyId,
      sequence,
      amountNgnMinor,
      amountUsdMinor: toUsdMinor(amountNgnMinor, RATE),
      ngnMinorPerUsd: RATE,
      payeeDeviceId,
      memo: 'test',
      issuedAt: clock.toISOString(),
      expiresAt: certificate.payload.expiresAt,
    };
    return {
      payload,
      signature: await signVoucher(payer.keys.privateKey, payload),
      certificate,
    };
  };

  return {
    store,
    gateway,
    service,
    payer,
    payee,
    otherPayee,
    lockVault,
    sign,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

const refused = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;

test('PayPal amounts are USD strings with exact cents', () => {
  assert.equal(usdValue(1250), '12.50');
  assert.equal(usdValue(5), '0.05');
  assert.throws(() => usdValue(12.5));
});

test('failures map to the right class', () => {
  assert.equal(classifyFailure(422, 'AUTHORIZATION_EXPIRED'), 'BLOCKED');
  assert.equal(classifyFailure(422, 'INSTRUMENT_DECLINED'), 'DECLINED');
  assert.equal(classifyFailure(429, 'RATE_LIMIT_REACHED'), 'RETRYABLE');
  assert.equal(classifyFailure(503, 'SERVICE_UNAVAILABLE'), 'AMBIGUOUS');
  assert.equal(classifyFailure(400, 'INVALID_PARAMETER_SYNTAX'), 'REJECTED');
});

test('re-registering the same key returns the same identity', async () => {
  const { service } = await setup();
  const keys = await generateKeyPair();
  const publicKey = await exportPublicKey(keys.publicKey);
  const keyId = await keyIdOf(publicKey);
  const issuedAt = '2026-11-05T10:00:00.000Z';
  const proof = await signRegistration(keys.privateKey, keyId, issuedAt);
  const first = await service.registerDevice({ publicKey, issuedAt, proof });
  const second = await service.registerDevice({ publicKey, issuedAt, proof });
  assert.equal(first.deviceId, second.deviceId);
});

test('knowing a public key is not enough to take over a device', async () => {
  const { service, payer } = await setup();
  const attacker = await generateKeyPair();
  const publicKey = await exportPublicKey(payer.keys.publicKey);
  const issuedAt = '2026-11-05T10:00:00.000Z';
  const proof = await signRegistration(attacker.privateKey, payer.keyId, issuedAt);
  await assert.rejects(service.registerDevice({ publicKey, issuedAt, proof }), refused('INVALID_PROOF'));
});

test('a voucher settles once with capture and ledger credit for the payee', async () => {
  const { service, gateway, payee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  const settled = await service.submitVoucher(payee.row, await sign(certificate, 1, 300_000));

  assert.equal(settled.status, 'SETTLED');
  assert.deepEqual(gateway.captures.map((c) => c.amountUsdMinor), [200]);
  const ledger = service.ledger(payee.row);
  assert.equal(ledger.balanceNgnMinor, 300_000);
  assert.equal(ledger.entries[0].capture_id, settled.captureId);
});

test('100 concurrent submissions from both devices produce one capture', async () => {
  const { service, gateway, payer, payee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  const voucher = await sign(certificate, 1, 300_000);
  gateway.delayMs = 5;

  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      service.submitVoucher(i % 2 ? payer.row : payee.row, voucher)
    )
  );

  assert.equal(gateway.captures.length, 1);
  assert.ok(results.every((result) => result.status === 'SETTLED'));
  assert.equal(service.ledger(payee.row).entries.length, 1);
});

test('payees reconnecting out of order both settle', async () => {
  const { service, gateway, payee, otherPayee, lockVault, sign, store } = await setup();
  const { certificate, vaultId } = await lockVault();
  const first = await sign(certificate, 1, 150_000, payee.deviceId);
  const second = await sign(certificate, 2, 150_000, otherPayee.deviceId);

  assert.equal((await service.submitVoucher(otherPayee.row, second)).status, 'SETTLED');
  assert.equal((await service.submitVoucher(payee.row, first)).status, 'SETTLED');

  assert.equal(gateway.captures.length, 2);
  assert.equal(store.findVault(vaultId)!.status, 'ACTIVE');
  assert.deepEqual(store.listAlerts(), []);
});

test('reusing a sequence is a replay: refused, alerted, vault blocked', async () => {
  const { service, gateway, payee, lockVault, sign, store } = await setup();
  const { certificate, vaultId } = await lockVault();
  await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));

  await assert.rejects(
    service.submitVoucher(payee.row, await sign(certificate, 1, 150_000)),
    refused('REPLAY_REJECTED')
  );
  assert.equal(gateway.captures.length, 1);
  assert.equal(store.findVault(vaultId)!.status, 'BLOCKED');
  assert.equal(store.listAlerts()[0].kind, 'REPLAY');
});

test('resubmitting an identical voucher returns the settled result, not a replay', async () => {
  const { service, gateway, payee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  const voucher = await sign(certificate, 1, 150_000);
  const first = await service.submitVoucher(payee.row, voucher);
  const second = await service.submitVoucher(payee.row, voucher);
  assert.equal(second.captureId, first.captureId);
  assert.equal(gateway.captures.length, 1);
});

test('over-spending across payees never captures past the ceiling', async () => {
  const { service, gateway, payee, otherPayee, lockVault, sign, store } = await setup();
  const { certificate, vaultId } = await lockVault();
  // Each voucher is valid alone, which is all an offline payee can check.
  await service.submitVoucher(payee.row, await sign(certificate, 1, 1_200_000, payee.deviceId));
  const second = await service.submitVoucher(
    otherPayee.row,
    await sign(certificate, 2, 1_200_000, otherPayee.deviceId)
  );

  assert.equal(second.status, 'REJECTED_OVERSPEND');
  assert.equal(gateway.captures.reduce((sum, c) => sum + c.amountUsdMinor, 0), 800);
  assert.equal(store.findVault(vaultId)!.status, 'BLOCKED');
  assert.equal(store.listAlerts()[0].kind, 'OVERSPEND');
});

test('a third party cannot submit a voucher', async () => {
  const { service, otherPayee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  await assert.rejects(
    service.submitVoucher(otherPayee.row, await sign(certificate, 1, 150_000)),
    refused('NOT_A_PARTY')
  );
});

test('a lost response is read back, giving one capture and a settled voucher', async () => {
  const { service, gateway, payee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  gateway.loseResponse = true;

  const result = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  assert.equal(result.status, 'SETTLED');
  assert.equal(gateway.captures.length, 1);
});

test('a retryable failure waits for its backoff, then settles', async () => {
  const { service, gateway, payee, lockVault, sign, advance } = await setup();
  const { certificate } = await lockVault();
  gateway.failNext.push(() => new PayPalError('RETRYABLE', 'RATE_LIMIT_REACHED', 'slow down'));

  const first = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  assert.equal(first.status, 'RETRYABLE_FAILURE');

  await service.sweep();
  assert.equal(gateway.captures.length, 0, 'must not retry before the backoff elapses');

  advance(60_000);
  await service.sweep();
  assert.equal(service.getVoucher(payee.row, first.voucherId).status, 'SETTLED');
});

test('retries stop at a terminal state instead of looping forever', async () => {
  const { service, gateway, payee, lockVault, sign, advance } = await setup();
  const { certificate } = await lockVault();
  for (let i = 0; i < 10; i++) {
    gateway.failNext.push(() => new PayPalError('RETRYABLE', 'RATE_LIMIT_REACHED', 'slow down'));
  }
  const { voucherId } = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  for (let i = 0; i < 10; i++) {
    advance(3_600_000);
    await service.sweep();
  }
  assert.equal(service.getVoucher(payee.row, voucherId).status, 'SETTLEMENT_BLOCKED');
});

test('an expired authorisation blocks instead of retrying', async () => {
  const { service, gateway, payee, lockVault, sign, store } = await setup();
  const { certificate, vaultId } = await lockVault();
  gateway.failNext.push(() => new PayPalError('BLOCKED', 'AUTHORIZATION_EXPIRED', 'expired'));

  const result = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  assert.equal(result.status, 'SETTLEMENT_BLOCKED');
  assert.equal(store.findVault(vaultId)!.status, 'BLOCKED');
});

test('a declined capture releases capacity', async () => {
  const { service, gateway, payee, payer, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  gateway.failNext.push(() => new PayPalError('DECLINED', 'INSTRUMENT_DECLINED', 'declined'));
  const result = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  assert.equal(result.status, 'DECLINED');
  assert.equal(service.currentVault(payer.row)!.remainingUsdMinor, 1_000);
});

test('capacity figures reconcile', async () => {
  const { service, gateway, payee, payer, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  gateway.failNext.push(() => new PayPalError('RETRYABLE', 'RATE_LIMIT_REACHED', 'slow down'));
  await service.submitVoucher(payee.row, await sign(certificate, 2, 300_000));

  const vault = service.currentVault(payer.row)!;
  assert.equal(vault.settledUsdMinor, 100);
  assert.equal(vault.reservedUsdMinor, 200);
  assert.equal(vault.remainingUsdMinor, 700);
});

test('melt is refused while a signed voucher has not arrived, then voids', async () => {
  const { service, gateway, payer, payee, lockVault, sign, store } = await setup();
  const { certificate, vaultId } = await lockVault();
  const inPayeeHands = await sign(certificate, 1, 150_000);

  await assert.rejects(service.meltVault(payer.row, vaultId, 1), refused('VOUCHER_UNSETTLED'));
  assert.equal(gateway.voided.length, 0);

  await service.submitVoucher(payee.row, inPayeeHands);
  await service.meltVault(payer.row, vaultId, 1);
  assert.equal(gateway.voided[0], store.findVault(vaultId)!.authorization_id);
  assert.equal(store.findVault(vaultId)!.status, 'MELTED');
});

test('a payee reaching a network just after expiry is still paid', async () => {
  const { service, payee, lockVault, sign, advance } = await setup();
  const { certificate } = await lockVault();
  const voucher = await sign(certificate, 1, 150_000);
  advance(25 * 3_600_000);
  assert.equal((await service.submitVoucher(payee.row, voucher)).status, 'SETTLED');
});

test('an abandoned vault is voided once the settlement window closes', async () => {
  const { service, gateway, lockVault, advance } = await setup();
  await lockVault();
  advance(73 * 3_600_000);
  await service.sweep();
  assert.equal(gateway.voided.length, 1);
});

test('replaying a webhook changes nothing, and a reversal debits the payee once', async () => {
  const { service, payee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  const settled = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  const event = {
    id: 'WH-1',
    event_type: 'PAYMENT.CAPTURE.REVERSED',
    resource: { id: settled.captureId! },
  };
  await service.handleWebhook({}, event);
  await service.handleWebhook({}, event);

  assert.equal(service.getVoucher(payee.row, settled.voucherId).status, 'REVERSED');
  assert.equal(service.ledger(payee.row).balanceNgnMinor, 0);
  assert.equal(service.ledger(payee.row).entries.length, 2);
});

test('both decline spellings fail a pending capture with no credit', async () => {
  for (const eventType of ['PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.DENIED']) {
    const { service, gateway, payee, lockVault, sign } = await setup();
    const { certificate } = await lockVault();
    gateway.nextCaptureStatus = 'PENDING';
    const voucher = await sign(certificate, 1, 150_000);
    const { voucherId, status } = await service.submitVoucher(payee.row, voucher);
    assert.equal(status, 'PENDING_CAPTURE');

    await service.handleWebhook({}, {
      id: eventType,
      event_type: eventType,
      resource: { invoice_id: voucherId },
    });
    assert.equal(service.getVoucher(payee.row, voucherId).status, 'DECLINED');
    assert.equal(service.ledger(payee.row).entries.length, 0);
  }
});

test('a pending capture credits the payee only when PayPal completes it', async () => {
  const { service, gateway, payee, lockVault, sign } = await setup();
  const { certificate } = await lockVault();
  gateway.nextCaptureStatus = 'PENDING';
  const pending = await service.submitVoucher(payee.row, await sign(certificate, 1, 150_000));
  assert.equal(service.ledger(payee.row).balanceNgnMinor, 0);

  await service.handleWebhook({}, {
    id: 'WH-2',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: pending.captureId!, invoice_id: pending.voucherId },
  });
  assert.equal(service.getVoucher(payee.row, pending.voucherId).status, 'SETTLED');
  assert.equal(service.ledger(payee.row).balanceNgnMinor, 150_000);
});

test('a forged webhook is refused', async () => {
  const { service, gateway } = await setup();
  gateway.webhookValid = false;
  await assert.rejects(service.handleWebhook({}, { id: 'x' }), refused('INVALID_WEBHOOK'));
});
