import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalize } from '../core/voucher/jcs';
import {
  exportPublicKey,
  generateKeyPair,
  signCertificate,
  signVoucher,
  toUsdMinor,
  verifyVoucher,
  type SignedVoucher,
  type VaultCertificatePayload,
  type VoucherPayload,
} from '../core/voucher/voucher';

const NOW = new Date('2026-11-05T10:00:00.000Z');
const RATE = 150_000;

async function fixture(overrides: Partial<VoucherPayload> = {}) {
  const issuer = await generateKeyPair();
  const payer = await generateKeyPair();
  const certificatePayload: VaultCertificatePayload = {
    vaultId: 'vault-1',
    deviceId: 'device-a',
    keyId: 'key-a',
    publicKey: await exportPublicKey(payer.publicKey),
    capacityNgnMinor: 1_500_000,
    capacityUsdMinor: 1_000,
    ngnMinorPerUsd: RATE,
    fxSource: 'demo-fixed',
    issuedAt: '2026-11-05T09:00:00.000Z',
    expiresAt: '2026-11-06T09:00:00.000Z',
  };
  const certificate = {
    payload: certificatePayload,
    signature: await signCertificate(issuer.privateKey, certificatePayload),
  };
  const payload: VoucherPayload = {
    voucherId: 'voucher-1',
    vaultId: 'vault-1',
    deviceId: 'device-a',
    keyId: 'key-a',
    sequence: 1,
    amountNgnMinor: 150_000,
    amountUsdMinor: 100,
    ngnMinorPerUsd: RATE,
    payeeDeviceId: 'device-b',
    memo: 'coke',
    issuedAt: '2026-11-05T09:30:00.000Z',
    expiresAt: '2026-11-06T09:00:00.000Z',
    ...overrides,
  };
  const voucher: SignedVoucher = {
    payload,
    signature: await signVoucher(payer.privateKey, payload),
    certificate,
  };
  return { issuer, payer, voucher };
}

test('canonical form ignores key order and rejects fractional amounts', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalize({ a: [true, null, 'x'], b: 1 }), canonicalize({ b: 1, a: [true, null, 'x'] }));
  assert.throws(() => canonicalize({ amount: 12.5 }), /safe integers/);
});

test('a genuine voucher verifies with no network', async () => {
  const { issuer, voucher } = await fixture();
  assert.deepEqual(await verifyVoucher(voucher, issuer.publicKey, NOW), { ok: true });
});

test('changing the amount after signing breaks the signature', async () => {
  const { issuer, voucher } = await fixture();
  const tampered = { ...voucher, payload: { ...voucher.payload, amountNgnMinor: 999_999 } };
  assert.deepEqual(await verifyVoucher(tampered, issuer.publicKey, NOW), {
    ok: false,
    reason: 'SIGNATURE_INVALID',
  });
});

test('a key the issuer never certified is refused', async () => {
  const { voucher } = await fixture();
  const stranger = await generateKeyPair();
  assert.deepEqual(await verifyVoucher(voucher, stranger.publicKey, NOW), {
    ok: false,
    reason: 'CERTIFICATE_INVALID',
  });
});

test('a certificate signature cannot be replayed as a voucher signature', async () => {
  const { issuer, voucher } = await fixture();
  const forged = { ...voucher, signature: voucher.certificate.signature };
  assert.deepEqual(await verifyVoucher(forged, issuer.publicKey, NOW), {
    ok: false,
    reason: 'SIGNATURE_INVALID',
  });
});

test('an expired voucher is refused', async () => {
  const { issuer, voucher } = await fixture();
  assert.deepEqual(await verifyVoucher(voucher, issuer.publicKey, new Date('2026-11-07T00:00:00Z')), {
    ok: false,
    reason: 'VOUCHER_EXPIRED',
  });
});

test('a voucher above the certified ceiling is refused', async () => {
  const amountNgnMinor = 1_650_000;
  const { issuer, voucher } = await fixture({
    amountNgnMinor,
    amountUsdMinor: toUsdMinor(amountNgnMinor, RATE),
  });
  assert.deepEqual(await verifyVoucher(voucher, issuer.publicKey, NOW), {
    ok: false,
    reason: 'OVER_CAPACITY',
  });
});

test('a USD amount that disagrees with the signed rate is refused', async () => {
  const { issuer, voucher } = await fixture({ amountUsdMinor: 1 });
  assert.deepEqual(await verifyVoucher(voucher, issuer.publicKey, NOW), {
    ok: false,
    reason: 'FX_MISMATCH',
  });
});
