import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  exportPublicKey,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  keyIdOf,
  signCertificate,
  verifyRegistration,
  verifyVoucher,
  type SignedVoucher,
  type VaultCertificate,
  type VaultCertificatePayload,
  type VerificationFailure,
} from '../../../core/voucher/voucher';
import { PayPalError, type PayPalGateway } from './paypal';
import { Store, type DeviceRow, type VaultRow, type VoucherRow } from './store';

const HOUR_MS = 3_600_000;
/** Certificates last a day; the grace keeps settlement inside PayPal's three-day honor period. */
const MAX_OFFLINE_MS = 24 * HOUR_MS;
const SETTLEMENT_GRACE_MS = 48 * HOUR_MS;
const REGISTRATION_FRESHNESS_MS = 5 * 60_000;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 2_000;

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SettlementOptions {
  fxNgnPerUsd: number;
  fxSource: string;
  now?: () => Date;
  random?: () => number;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function vaultView(store: Store, vault: VaultRow) {
  const { reservedUsdMinor, settledUsdMinor } = store.vaultUsage(vault.vault_id);
  return {
    vaultId: vault.vault_id,
    status: vault.status,
    blockedReason: vault.blocked_reason,
    authorizationId: vault.authorization_id,
    capacityUsdMinor: vault.capacity_usd_minor,
    capacityNgnMinor: vault.capacity_ngn_minor,
    reservedUsdMinor,
    settledUsdMinor,
    remainingUsdMinor: vault.capacity_usd_minor - reservedUsdMinor - settledUsdMinor,
    ngnMinorPerUsd: vault.ngn_minor_per_usd,
    fxSource: vault.fx_source,
    expiresAt: vault.expires_at,
    certificate: vault.certificate ? (JSON.parse(vault.certificate) as VaultCertificate) : null,
  };
}

export function voucherView(voucher: VoucherRow) {
  return {
    voucherId: voucher.voucher_id,
    vaultId: voucher.vault_id,
    payerDeviceId: voucher.device_id,
    payeeDeviceId: voucher.payee_device_id,
    sequence: voucher.sequence,
    amountNgnMinor: voucher.amount_ngn_minor,
    amountUsdMinor: voucher.amount_usd_minor,
    status: voucher.status,
    captureId: voucher.capture_id,
    failure: voucher.failure,
    submittedBy: voucher.submitted_by,
    updatedAt: voucher.updated_at,
  };
}

export class SettlementService {
  private readonly store: Store;
  private readonly gateway: PayPalGateway | null;
  private readonly options: SettlementOptions;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly inFlight = new Map<string, Promise<VoucherRow>>();
  private issuerPrivateKey: CryptoKey | null = null;
  private issuerPublicJwk: JsonWebKey | null = null;

  constructor(store: Store, gateway: PayPalGateway | null, options: SettlementOptions) {
    this.store = store;
    this.gateway = gateway;
    this.options = options;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  private iso() {
    return this.now().toISOString();
  }

  private paypal(): PayPalGateway {
    if (!this.gateway) {
      throw new ApiError(503, 'PAYPAL_NOT_CONFIGURED', 'PayPal credentials are not configured');
    }
    return this.gateway;
  }

  /** The issuer key must survive restarts, or every certificate in the field stops verifying. */
  private async issuer() {
    if (this.issuerPrivateKey && this.issuerPublicJwk) {
      return { privateKey: this.issuerPrivateKey, publicJwk: this.issuerPublicJwk };
    }
    let stored = this.store.getSetting('issuer_key');
    if (!stored) {
      const pair = await generateKeyPair(true);
      stored = JSON.stringify({
        privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
        publicKey: await exportPublicKey(pair.publicKey),
      });
      this.store.setSetting('issuer_key', stored);
    }
    const parsed = JSON.parse(stored) as { privateKey: JsonWebKey; publicKey: JsonWebKey };
    this.issuerPrivateKey = await importPrivateKey(parsed.privateKey);
    this.issuerPublicJwk = parsed.publicKey;
    return { privateKey: this.issuerPrivateKey, publicJwk: this.issuerPublicJwk };
  }

  public async issuerPublicKey() {
    return (await this.issuer()).publicJwk;
  }

  public async registerDevice(input: {
    publicKey: JsonWebKey;
    issuedAt: string;
    proof: string;
  }) {
    const age = Math.abs(this.now().getTime() - new Date(input.issuedAt).getTime());
    if (!(age <= REGISTRATION_FRESHNESS_MS)) {
      throw new ApiError(400, 'STALE_REGISTRATION', 'Registration proof is too old');
    }

    const keyId = await keyIdOf(input.publicKey);
    let verified = false;
    try {
      const key = await importPublicKey(input.publicKey);
      verified = await verifyRegistration(key, input.proof, keyId, input.issuedAt);
    } catch {
      verified = false;
    }
    if (!verified) {
      throw new ApiError(401, 'INVALID_PROOF', 'Could not verify possession of the private key');
    }

    const token = randomBytes(32).toString('base64url');
    const existing = this.store.findDeviceByKey(keyId);
    if (existing) {
      this.store.updateDeviceToken(existing.device_id, hashToken(token));
      return { deviceId: existing.device_id, keyId, token };
    }

    const deviceId = randomUUID();
    this.store.insertDevice({
      device_id: deviceId,
      key_id: keyId,
      public_key: JSON.stringify(input.publicKey),
      token_hash: hashToken(token),
      created_at: this.iso(),
    });
    return { deviceId, keyId, token };
  }

  public authenticate(token: string | undefined): DeviceRow {
    const device = token ? this.store.findDeviceByToken(hashToken(token)) : undefined;
    if (!device) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid device token is required');
    return device;
  }

  public async createVault(device: DeviceRow, amountNgnMinor: number, appUrl: string) {
    if (!Number.isSafeInteger(amountNgnMinor) || amountNgnMinor <= 0) {
      throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must be a positive whole number of kobo');
    }
    const current = this.store.findCurrentVault(device.device_id);
    if (current?.status === 'ACTIVE' || current?.status === 'BLOCKED') {
      throw new ApiError(409, 'VAULT_EXISTS', 'Melt the current vault before locking a new one');
    }

    const ngnMinorPerUsd = Math.round(this.options.fxNgnPerUsd * 100);
    const capacityUsdMinor = Math.floor((amountNgnMinor * 100) / ngnMinorPerUsd);
    if (capacityUsdMinor < 100) {
      throw new ApiError(400, 'AMOUNT_TOO_SMALL', 'A vault must hold at least 1.00 USD');
    }

    const vaultId = randomUUID();
    const returnUrl = `${appUrl}/?vault=${vaultId}&paypal=approved`;
    const cancelUrl = `${appUrl}/?vault=${vaultId}&paypal=cancelled`;
    const { orderId, approveUrl } = await this.paypal().createAuthorizeOrder({
      vaultId,
      amountUsdMinor: capacityUsdMinor,
      returnUrl,
      cancelUrl,
    });

    this.store.insertVault({
      vault_id: vaultId,
      device_id: device.device_id,
      status: 'PENDING_APPROVAL',
      paypal_order_id: orderId,
      authorization_id: null,
      capacity_usd_minor: capacityUsdMinor,
      capacity_ngn_minor: amountNgnMinor,
      ngn_minor_per_usd: ngnMinorPerUsd,
      fx_source: this.options.fxSource,
      certificate: null,
      blocked_reason: null,
      expires_at: null,
      created_at: this.iso(),
    });
    return { vaultId, orderId, approveUrl };
  }

  private ownedVault(device: DeviceRow, vaultId: string) {
    const vault = this.store.findVault(vaultId);
    if (!vault || vault.device_id !== device.device_id) {
      throw new ApiError(404, 'VAULT_NOT_FOUND', 'No such vault for this device');
    }
    return vault;
  }

  /** Runs after the payer returns from PayPal, and issues the offline certificate. */
  public async authorizeVault(device: DeviceRow, vaultId: string) {
    const vault = this.ownedVault(device, vaultId);
    if (vault.status === 'ACTIVE') return vaultView(this.store, vault);
    if (vault.status !== 'PENDING_APPROVAL') {
      throw new ApiError(409, 'VAULT_NOT_PENDING', `Vault is ${vault.status}`);
    }

    const { authorizationId } = await this.paypal().authorizeOrder(vault.paypal_order_id);
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + MAX_OFFLINE_MS).toISOString();
    const payload: VaultCertificatePayload = {
      vaultId: vault.vault_id,
      deviceId: device.device_id,
      keyId: device.key_id,
      publicKey: JSON.parse(device.public_key) as JsonWebKey,
      capacityNgnMinor: vault.capacity_ngn_minor,
      capacityUsdMinor: vault.capacity_usd_minor,
      ngnMinorPerUsd: vault.ngn_minor_per_usd,
      fxSource: vault.fx_source,
      issuedAt: issuedAt.toISOString(),
      expiresAt,
    };
    const { privateKey } = await this.issuer();
    const certificate: VaultCertificate = {
      payload,
      signature: await signCertificate(privateKey, payload),
    };
    this.store.activateVault(vault.vault_id, authorizationId, JSON.stringify(certificate), expiresAt);
    return vaultView(this.store, this.store.findVault(vault.vault_id)!);
  }

  public currentVault(device: DeviceRow) {
    const vault = this.store.findCurrentVault(device.device_id);
    return vault ? vaultView(this.store, vault) : null;
  }

  private blockVault(vault: VaultRow, kind: string, detail: string, voucherId: string | null) {
    this.store.setVaultStatus(vault.vault_id, 'BLOCKED', detail);
    this.store.raiseAlert(kind, detail, vault.vault_id, voucherId, this.iso());
  }

  /**
   * Accepts a voucher from either party. Sequences are tracked as a seen-set, not a
   * high-water mark: the payees of one payer reconnect in any order, so a lower
   * sequence arriving late is normal, and only a reused sequence is a replay.
   */
  public async submitVoucher(device: DeviceRow, voucher: SignedVoucher) {
    const { payload } = voucher;
    if (device.device_id !== payload.deviceId && device.device_id !== payload.payeeDeviceId) {
      throw new ApiError(403, 'NOT_A_PARTY', 'Only the payer or the payee may submit a voucher');
    }

    const issuer = await importPublicKey((await this.issuer()).publicJwk);
    const verdict = await verifyVoucher(voucher, issuer, this.now(), SETTLEMENT_GRACE_MS);
    if (!verdict.ok) {
      const reason: VerificationFailure = verdict.reason;
      throw new ApiError(422, reason, `Voucher refused: ${reason}`);
    }

    // The refusal is thrown after the commit, so the block and alert it records survive.
    const accepted = this.store.transaction(() => this.acceptVoucher(device, voucher));
    if (accepted === 'REPLAY') {
      throw new ApiError(409, 'REPLAY_REJECTED', `Sequence ${payload.sequence} was already used`);
    }
    return voucherView(await this.settle(accepted.voucher_id));
  }

  private acceptVoucher(device: DeviceRow, voucher: SignedVoucher): VoucherRow | 'REPLAY' {
    const { payload } = voucher;
    const body = JSON.stringify(voucher);

    const existing = this.store.findVoucher(payload.voucherId);
    if (existing) {
      if (existing.body !== body) {
        throw new ApiError(409, 'VOUCHER_CONFLICT', 'This voucher ID was used with different content');
      }
      return existing;
    }

    const vault = this.store.findVault(payload.vaultId);
    if (!vault || vault.status === 'PENDING_APPROVAL') {
      throw new ApiError(422, 'VAULT_UNKNOWN', 'Voucher names a vault that was never authorised');
    }

    const reused = this.store.findVoucherBySequence(payload.vaultId, payload.sequence);
    if (reused) {
      this.blockVault(
        vault,
        'REPLAY',
        `Sequence ${payload.sequence} reused by ${payload.voucherId}, already held by ${reused.voucher_id}`,
        payload.voucherId
      );
      return 'REPLAY';
    }

    const { reservedUsdMinor, settledUsdMinor } = this.store.vaultUsage(vault.vault_id);
    const remaining = vault.capacity_usd_minor - reservedUsdMinor - settledUsdMinor;
    const overspent = payload.amountUsdMinor > remaining;
    if (overspent) {
      this.blockVault(
        vault,
        'OVERSPEND',
        `Voucher ${payload.voucherId} for ${payload.amountUsdMinor} exceeds remaining ${remaining}`,
        payload.voucherId
      );
    }

    const at = this.iso();
    const row: VoucherRow = {
      voucher_id: payload.voucherId,
      vault_id: payload.vaultId,
      device_id: payload.deviceId,
      payee_device_id: payload.payeeDeviceId,
      sequence: payload.sequence,
      amount_usd_minor: payload.amountUsdMinor,
      amount_ngn_minor: payload.amountNgnMinor,
      body,
      status: overspent ? 'REJECTED_OVERSPEND' : 'ACCEPTED',
      capture_id: null,
      failure: overspent ? 'Exceeds the vault ceiling' : null,
      attempts: 0,
      lease_until: 0,
      next_attempt_at: 0,
      submitted_by: device.device_id,
      created_at: at,
      updated_at: at,
    };
    this.store.insertVoucher(row);
    return row;
  }

  /** Concurrent submissions of one voucher share a single attempt and its outcome. */
  public settle(voucherId: string): Promise<VoucherRow> {
    const running = this.inFlight.get(voucherId);
    if (running) return running;
    const attempt = this.runSettlement(voucherId).finally(() => this.inFlight.delete(voucherId));
    this.inFlight.set(voucherId, attempt);
    return attempt;
  }

  private async runSettlement(voucherId: string): Promise<VoucherRow> {
    const at = this.now().getTime();
    const claimed = this.store.claimVoucher(voucherId, at, at + LEASE_MS, this.iso());
    if (!claimed) return this.store.findVoucher(voucherId)!;

    const voucher = this.store.findVoucher(voucherId)!;
    const vault = this.store.findVault(voucher.vault_id)!;
    const gateway = this.paypal();

    try {
      const capture = await gateway.captureAuthorization({
        authorizationId: vault.authorization_id!,
        amountUsdMinor: voucher.amount_usd_minor,
        voucherId,
      });
      this.recordCapture(voucher, capture.captureId, capture.status);
    } catch (error) {
      await this.handleCaptureFailure(voucher, vault, gateway, error);
    }
    return this.store.findVoucher(voucherId)!;
  }

  private recordCapture(voucher: VoucherRow, captureId: string, status: 'COMPLETED' | 'PENDING') {
    if (status === 'PENDING') {
      this.store.updateVoucher(
        voucher.voucher_id,
        { status: 'PENDING_CAPTURE', capture_id: captureId },
        this.iso()
      );
      return;
    }
    this.completeSettlement(voucher, captureId);
  }

  private completeSettlement(voucher: VoucherRow, captureId: string) {
    this.store.transaction(() => {
      const at = this.iso();
      this.store.updateVoucher(
        voucher.voucher_id,
        { status: 'SETTLED', capture_id: captureId, failure: null },
        at
      );
      this.store.insertLedgerEntry({
        entry_id: randomUUID(),
        device_id: voucher.payee_device_id,
        voucher_id: voucher.voucher_id,
        amount_ngn_minor: voucher.amount_ngn_minor,
        amount_usd_minor: voucher.amount_usd_minor,
        capture_id: captureId,
        kind: 'CREDIT',
        created_at: at,
      });
    });
  }

  private backoff(attempts: number) {
    const ceiling = BASE_BACKOFF_MS * 2 ** attempts;
    return Math.floor(ceiling / 2 + this.random() * (ceiling / 2));
  }

  private async handleCaptureFailure(
    voucher: VoucherRow,
    vault: VaultRow,
    gateway: PayPalGateway,
    error: unknown
  ) {
    const failure =
      error instanceof PayPalError
        ? error
        : new PayPalError('AMBIGUOUS', 'UNKNOWN', String(error));

    if (failure.failureClass === 'AMBIGUOUS') {
      // The capture may have happened. Read it back rather than risk charging twice.
      try {
        const found = await gateway.findCapture(vault.paypal_order_id, voucher.voucher_id);
        if (found) {
          this.recordCapture(voucher, found.captureId, found.status);
          return;
        }
      } catch {
        // Still unknown, so it stays retryable and the same request ID protects the retry.
      }
    }

    const at = this.iso();
    if (failure.failureClass === 'AMBIGUOUS' || failure.failureClass === 'RETRYABLE') {
      const attempts = voucher.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        this.store.updateVoucher(
          voucher.voucher_id,
          { status: 'SETTLEMENT_BLOCKED', attempts, failure: `Gave up: ${failure.issue}` },
          at
        );
        this.store.raiseAlert('SETTLEMENT_STUCK', failure.message, vault.vault_id, voucher.voucher_id, at);
        return;
      }
      this.store.updateVoucher(
        voucher.voucher_id,
        {
          status: 'RETRYABLE_FAILURE',
          attempts,
          failure: failure.issue,
          next_attempt_at: this.now().getTime() + this.backoff(attempts),
        },
        at
      );
      return;
    }

    if (failure.failureClass === 'BLOCKED') {
      this.store.updateVoucher(
        voucher.voucher_id,
        { status: 'SETTLEMENT_BLOCKED', failure: failure.issue },
        at
      );
      this.blockVault(vault, 'SETTLEMENT_BLOCKED', failure.message, voucher.voucher_id);
      return;
    }

    this.store.updateVoucher(voucher.voucher_id, { status: 'DECLINED', failure: failure.issue }, at);
    this.store.raiseAlert('CAPTURE_DECLINED', failure.message, vault.vault_id, voucher.voucher_id, at);
  }

  /** Retries due vouchers, voids long-expired vaults. Called on a timer. */
  public async sweep() {
    const now = this.now().getTime();
    await Promise.all(this.store.listDueVouchers(now).map((v) => this.settle(v.voucher_id)));

    const cutoff = new Date(now - SETTLEMENT_GRACE_MS).toISOString();
    for (const vault of this.store.listExpiredVaults(cutoff)) {
      await this.voidVault(vault);
    }
  }

  private async voidVault(vault: VaultRow) {
    if (vault.authorization_id) {
      await this.paypal().voidAuthorization(vault.authorization_id);
    }
    this.store.setVaultStatus(vault.vault_id, 'MELTED');
  }

  /**
   * The server only knows about vouchers that reached it, so the payer must declare
   * how many it signed. Any gap is a voucher still in a payee's hands: voiding now
   * would leave that payee holding something that can never settle.
   */
  public async meltVault(device: DeviceRow, vaultId: string, lastIssuedSequence: number) {
    const vault = this.ownedVault(device, vaultId);
    if (vault.status === 'MELTED') return vaultView(this.store, vault);
    if (vault.status === 'BLOCKED') {
      throw new ApiError(409, 'VAULT_BLOCKED', vault.blocked_reason ?? 'Vault is blocked');
    }
    if (!Number.isSafeInteger(lastIssuedSequence) || lastIssuedSequence < 0) {
      throw new ApiError(400, 'INVALID_SEQUENCE', 'lastIssuedSequence must be a whole number');
    }

    const vouchers = this.store.listVaultVouchers(vaultId);
    const seen = new Set(vouchers.map((voucher) => voucher.sequence));
    for (let sequence = 1; sequence <= lastIssuedSequence; sequence++) {
      if (!seen.has(sequence)) {
        throw new ApiError(
          409,
          'VOUCHER_UNSETTLED',
          `Voucher ${sequence} has not reached the settlement service yet`
        );
      }
    }
    const open = vouchers.find((voucher) =>
      ['ACCEPTED', 'SETTLING', 'RETRYABLE_FAILURE', 'PENDING_CAPTURE'].includes(voucher.status)
    );
    if (open) {
      throw new ApiError(409, 'VOUCHER_UNSETTLED', `Voucher ${open.voucher_id} is still settling`);
    }

    await this.voidVault(vault);
    return vaultView(this.store, this.store.findVault(vaultId)!);
  }

  public listVouchers(device: DeviceRow) {
    return this.store.listVouchersForDevice(device.device_id).map(voucherView);
  }

  public getVoucher(device: DeviceRow, voucherId: string) {
    const voucher = this.store.findVoucher(voucherId);
    if (
      !voucher ||
      (voucher.device_id !== device.device_id && voucher.payee_device_id !== device.device_id)
    ) {
      throw new ApiError(404, 'VOUCHER_NOT_FOUND', 'No such voucher for this device');
    }
    return voucherView(voucher);
  }

  public ledger(device: DeviceRow) {
    const entries = this.store.listLedger(device.device_id);
    const balanceNgnMinor = entries.reduce(
      (total, entry) =>
        total + (entry.kind === 'CREDIT' ? entry.amount_ngn_minor : -entry.amount_ngn_minor),
      0
    );
    return { balanceNgnMinor, entries };
  }

  public async handleWebhook(
    headers: Record<string, string | undefined>,
    event: { id?: string; event_type?: string; resource?: { id?: string; invoice_id?: string } }
  ) {
    if (!(await this.paypal().verifyWebhook(headers, event))) {
      throw new ApiError(401, 'INVALID_WEBHOOK', 'Webhook signature did not verify');
    }
    if (!event.id || !this.store.recordWebhookEvent(event.id, this.iso())) return;

    const resource = event.resource ?? {};
    const voucher =
      (resource.invoice_id && this.store.findVoucher(resource.invoice_id)) ||
      (resource.id && this.store.findVoucherByCapture(resource.id)) ||
      undefined;

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        if (voucher && voucher.status === 'PENDING_CAPTURE' && resource.id) {
          this.completeSettlement(voucher, resource.id);
        }
        break;
      case 'PAYMENT.CAPTURE.DECLINED':
      case 'PAYMENT.CAPTURE.DENIED':
        if (voucher && voucher.status !== 'SETTLED') {
          this.store.updateVoucher(
            voucher.voucher_id,
            { status: 'DECLINED', failure: event.event_type },
            this.iso()
          );
        } else if (voucher) {
          this.reverse(voucher, event.event_type);
        }
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED':
        if (voucher) this.reverse(voucher, event.event_type);
        break;
      case 'PAYMENT.AUTHORIZATION.VOIDED': {
        const vault = resource.id && this.store.findVaultByAuthorization(resource.id);
        if (vault) this.store.setVaultStatus(vault.vault_id, 'MELTED');
        break;
      }
      default:
        console.info(`[webhook] ignored ${event.event_type}`);
    }
  }

  /** A settled voucher can still be undone at PayPal, so the payee's credit is reversed too. */
  private reverse(voucher: VoucherRow, reason: string) {
    this.store.transaction(() => {
      const at = this.iso();
      this.store.updateVoucher(voucher.voucher_id, { status: 'REVERSED', failure: reason }, at);
      this.store.insertLedgerEntry({
        entry_id: randomUUID(),
        device_id: voucher.payee_device_id,
        voucher_id: voucher.voucher_id,
        amount_ngn_minor: voucher.amount_ngn_minor,
        amount_usd_minor: voucher.amount_usd_minor,
        capture_id: voucher.capture_id ?? 'unknown',
        kind: 'REVERSAL',
        created_at: at,
      });
    });
  }
}
