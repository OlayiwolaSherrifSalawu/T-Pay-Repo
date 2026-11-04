import { canonicalize, type CanonicalValue } from './jcs';

/** Domain-separation prefixes: a signature over one type can never pass as another (DT-04). */
const VOUCHER_DOMAIN = 'T-PAY-VOUCHER-V1\n';
const CERTIFICATE_DOMAIN = 'T-PAY-VAULT-CERT-V1\n';

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const;

/**
 * Issued by the backend while the payer is online. It is what lets a payee who has
 * no network trust the payer's key, vault ceiling, FX rate and expiry.
 */
export interface VaultCertificatePayload {
  vaultId: string;
  deviceId: string;
  keyId: string;
  publicKey: JsonWebKey;
  capacityNgnMinor: number;
  capacityUsdMinor: number;
  /** Naira per US dollar, in kobo per cent ratio form: minor NGN for 1 USD. */
  ngnMinorPerUsd: number;
  fxSource: string;
  issuedAt: string;
  expiresAt: string;
}

export interface VaultCertificate {
  payload: VaultCertificatePayload;
  signature: string;
}

export interface VoucherPayload {
  voucherId: string;
  vaultId: string;
  deviceId: string;
  keyId: string;
  sequence: number;
  amountNgnMinor: number;
  amountUsdMinor: number;
  ngnMinorPerUsd: number;
  payeeDeviceId: string;
  memo: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SignedVoucher {
  payload: VoucherPayload;
  signature: string;
  certificate: VaultCertificate;
}

export type VerificationFailure =
  | 'CERTIFICATE_INVALID'
  | 'CERTIFICATE_EXPIRED'
  | 'SIGNATURE_INVALID'
  | 'BINDING_MISMATCH'
  | 'VOUCHER_EXPIRED'
  | 'OVER_CAPACITY'
  | 'AMOUNT_INVALID'
  | 'FX_MISMATCH';

export type VerificationResult = { ok: true } | { ok: false; reason: VerificationFailure };

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const voucherBytes = (payload: VoucherPayload) =>
  bytesOf(VOUCHER_DOMAIN + canonicalize(payload as unknown as CanonicalValue));

export const certificateBytes = (payload: VaultCertificatePayload) =>
  bytesOf(CERTIFICATE_DOMAIN + canonicalize(payload as unknown as CanonicalValue));

export const generateKeyPair = (extractable = false) =>
  crypto.subtle.generateKey(ALGORITHM, extractable, ['sign', 'verify']);

export const importPublicKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, ALGORITHM, true, ['verify']);

export const importPrivateKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['sign']);

export const exportPublicKey = (key: CryptoKey) => crypto.subtle.exportKey('jwk', key);

/** WebCrypto yields the raw 64-byte r||s pair, which is what travels (DT-03). */
async function sign(privateKey: CryptoKey, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign(SIGNATURE, privateKey, bytes)));
}

async function verify(
  publicKey: CryptoKey,
  signature: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(SIGNATURE, publicKey, base64UrlDecode(signature), bytes);
  } catch {
    return false;
  }
}

export const signVoucher = (privateKey: CryptoKey, payload: VoucherPayload) =>
  sign(privateKey, voucherBytes(payload));

export const signCertificate = (privateKey: CryptoKey, payload: VaultCertificatePayload) =>
  sign(privateKey, certificateBytes(payload));

/** The USD amount a naira amount settles for, rounded up so the hold covers it. */
export const toUsdMinor = (amountNgnMinor: number, ngnMinorPerUsd: number) =>
  Math.ceil((amountNgnMinor * 100) / ngnMinorPerUsd);

/**
 * Everything a payee can check with no network. The same function runs on the
 * backend, so a device and the settlement service cannot disagree about validity.
 * It cannot see other vouchers: spend across payees is caught at reconciliation.
 */
export async function verifyVoucher(
  voucher: SignedVoucher,
  issuerPublicKey: CryptoKey,
  now: Date
): Promise<VerificationResult> {
  const { payload, signature, certificate } = voucher;
  const certificatePayload = certificate.payload;

  const certificateValid = await verify(
    issuerPublicKey,
    certificate.signature,
    certificateBytes(certificatePayload)
  );
  if (!certificateValid) return { ok: false, reason: 'CERTIFICATE_INVALID' };

  if (
    payload.vaultId !== certificatePayload.vaultId ||
    payload.deviceId !== certificatePayload.deviceId ||
    payload.keyId !== certificatePayload.keyId
  ) {
    return { ok: false, reason: 'BINDING_MISMATCH' };
  }

  const payerKey = await importPublicKey(certificatePayload.publicKey);
  if (!(await verify(payerKey, signature, voucherBytes(payload)))) {
    return { ok: false, reason: 'SIGNATURE_INVALID' };
  }

  const issuedAt = new Date(payload.issuedAt).getTime();
  if (issuedAt >= new Date(certificatePayload.expiresAt).getTime()) {
    return { ok: false, reason: 'CERTIFICATE_EXPIRED' };
  }
  if (now.getTime() >= new Date(payload.expiresAt).getTime()) {
    return { ok: false, reason: 'VOUCHER_EXPIRED' };
  }

  if (
    !Number.isSafeInteger(payload.amountNgnMinor) ||
    payload.amountNgnMinor <= 0 ||
    !Number.isSafeInteger(payload.amountUsdMinor) ||
    payload.amountUsdMinor <= 0
  ) {
    return { ok: false, reason: 'AMOUNT_INVALID' };
  }
  if (
    payload.ngnMinorPerUsd !== certificatePayload.ngnMinorPerUsd ||
    payload.amountUsdMinor !== toUsdMinor(payload.amountNgnMinor, payload.ngnMinorPerUsd)
  ) {
    return { ok: false, reason: 'FX_MISMATCH' };
  }
  if (payload.amountUsdMinor > certificatePayload.capacityUsdMinor) {
    return { ok: false, reason: 'OVER_CAPACITY' };
  }

  return { ok: true };
}
