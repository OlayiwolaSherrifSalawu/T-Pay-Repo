import { DatabaseSync } from 'node:sqlite';

export type VaultStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'BLOCKED' | 'MELTED';

export type VoucherStatus =
  | 'ACCEPTED'
  | 'SETTLING'
  | 'RETRYABLE_FAILURE'
  | 'PENDING_CAPTURE'
  | 'SETTLED'
  | 'SETTLEMENT_BLOCKED'
  | 'DECLINED'
  | 'REVERSED'
  | 'REJECTED_OVERSPEND';

/** Vouchers that still hold vault capacity. Declined and reversed ones release it. */
const HOLDING_STATUSES = [
  'ACCEPTED',
  'SETTLING',
  'RETRYABLE_FAILURE',
  'PENDING_CAPTURE',
  'SETTLEMENT_BLOCKED',
];

export interface DeviceRow {
  device_id: string;
  key_id: string;
  public_key: string;
  token_hash: string;
  created_at: string;
}

export interface VaultRow {
  vault_id: string;
  device_id: string;
  status: VaultStatus;
  paypal_order_id: string;
  authorization_id: string | null;
  capacity_usd_minor: number;
  capacity_ngn_minor: number;
  ngn_minor_per_usd: number;
  fx_source: string;
  certificate: string | null;
  blocked_reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface VoucherRow {
  voucher_id: string;
  vault_id: string;
  device_id: string;
  payee_device_id: string;
  sequence: number;
  amount_usd_minor: number;
  amount_ngn_minor: number;
  body: string;
  status: VoucherStatus;
  capture_id: string | null;
  failure: string | null;
  attempts: number;
  lease_until: number;
  next_attempt_at: number;
  submitted_by: string;
  created_at: string;
  updated_at: string;
}

export interface LedgerRow {
  entry_id: string;
  device_id: string;
  voucher_id: string;
  amount_ngn_minor: number;
  amount_usd_minor: number;
  capture_id: string;
  kind: 'CREDIT' | 'REVERSAL';
  created_at: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    key_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vaults (
    vault_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(device_id),
    status TEXT NOT NULL,
    paypal_order_id TEXT NOT NULL,
    authorization_id TEXT,
    capacity_usd_minor INTEGER NOT NULL,
    capacity_ngn_minor INTEGER NOT NULL,
    ngn_minor_per_usd INTEGER NOT NULL,
    fx_source TEXT NOT NULL,
    certificate TEXT,
    blocked_reason TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vouchers (
    voucher_id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(vault_id),
    device_id TEXT NOT NULL,
    payee_device_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    amount_usd_minor INTEGER NOT NULL,
    amount_ngn_minor INTEGER NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    capture_id TEXT,
    failure TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    submitted_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (vault_id, sequence)
  );
  CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    voucher_id TEXT NOT NULL,
    amount_ngn_minor INTEGER NOT NULL,
    amount_usd_minor INTEGER NOT NULL,
    capture_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (voucher_id, kind)
  );
  CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS alerts (
    alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id TEXT,
    voucher_id TEXT,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  public close() {
    this.db.close();
  }

  /** node:sqlite calls are synchronous, so this body cannot interleave with another request. */
  public transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  public getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  public setSetting(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  public findDeviceByKey(keyId: string) {
    return this.db.prepare('SELECT * FROM devices WHERE key_id = ?').get(keyId) as
      | DeviceRow
      | undefined;
  }

  public findDeviceByToken(tokenHash: string) {
    return this.db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(tokenHash) as
      | DeviceRow
      | undefined;
  }

  public insertDevice(device: DeviceRow) {
    this.db
      .prepare(
        `INSERT INTO devices (device_id, key_id, public_key, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(device.device_id, device.key_id, device.public_key, device.token_hash, device.created_at);
  }

  public updateDeviceToken(deviceId: string, tokenHash: string) {
    this.db.prepare('UPDATE devices SET token_hash = ? WHERE device_id = ?').run(tokenHash, deviceId);
  }

  public insertVault(vault: VaultRow) {
    this.db
      .prepare(
        `INSERT INTO vaults (vault_id, device_id, status, paypal_order_id, authorization_id,
           capacity_usd_minor, capacity_ngn_minor, ngn_minor_per_usd, fx_source, certificate,
           blocked_reason, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        vault.vault_id,
        vault.device_id,
        vault.status,
        vault.paypal_order_id,
        vault.authorization_id,
        vault.capacity_usd_minor,
        vault.capacity_ngn_minor,
        vault.ngn_minor_per_usd,
        vault.fx_source,
        vault.certificate,
        vault.blocked_reason,
        vault.expires_at,
        vault.created_at
      );
  }

  public findVault(vaultId: string) {
    return this.db.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as
      | VaultRow
      | undefined;
  }

  public findCurrentVault(deviceId: string) {
    return this.db
      .prepare(
        `SELECT * FROM vaults WHERE device_id = ? AND status != 'MELTED'
         ORDER BY created_at DESC, rowid DESC LIMIT 1`
      )
      .get(deviceId) as VaultRow | undefined;
  }

  public findVaultByAuthorization(authorizationId: string) {
    return this.db.prepare('SELECT * FROM vaults WHERE authorization_id = ?').get(authorizationId) as
      | VaultRow
      | undefined;
  }

  public listExpiredVaults(cutoffIso: string) {
    return this.db
      .prepare(`SELECT * FROM vaults WHERE status IN ('ACTIVE', 'BLOCKED') AND expires_at < ?`)
      .all(cutoffIso) as unknown as VaultRow[];
  }

  public activateVault(vaultId: string, authorizationId: string, certificate: string, expiresAt: string) {
    this.db
      .prepare(
        `UPDATE vaults SET status = 'ACTIVE', authorization_id = ?, certificate = ?, expires_at = ?
         WHERE vault_id = ?`
      )
      .run(authorizationId, certificate, expiresAt, vaultId);
  }

  public setVaultStatus(vaultId: string, status: VaultStatus, blockedReason: string | null = null) {
    this.db
      .prepare('UPDATE vaults SET status = ?, blocked_reason = ? WHERE vault_id = ?')
      .run(status, blockedReason, vaultId);
  }

  public findVoucher(voucherId: string) {
    return this.db.prepare('SELECT * FROM vouchers WHERE voucher_id = ?').get(voucherId) as
      | VoucherRow
      | undefined;
  }

  public findVoucherBySequence(vaultId: string, sequence: number) {
    return this.db
      .prepare('SELECT * FROM vouchers WHERE vault_id = ? AND sequence = ?')
      .get(vaultId, sequence) as VoucherRow | undefined;
  }

  public findVoucherByCapture(captureId: string) {
    return this.db.prepare('SELECT * FROM vouchers WHERE capture_id = ?').get(captureId) as
      | VoucherRow
      | undefined;
  }

  public insertVoucher(voucher: VoucherRow) {
    this.db
      .prepare(
        `INSERT INTO vouchers (voucher_id, vault_id, device_id, payee_device_id, sequence,
           amount_usd_minor, amount_ngn_minor, body, status, capture_id, failure, attempts,
           lease_until, next_attempt_at, submitted_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        voucher.voucher_id,
        voucher.vault_id,
        voucher.device_id,
        voucher.payee_device_id,
        voucher.sequence,
        voucher.amount_usd_minor,
        voucher.amount_ngn_minor,
        voucher.body,
        voucher.status,
        voucher.capture_id,
        voucher.failure,
        voucher.attempts,
        voucher.lease_until,
        voucher.next_attempt_at,
        voucher.submitted_by,
        voucher.created_at,
        voucher.updated_at
      );
  }

  /** Atomically takes the settlement lease. Returns false if another worker holds it. */
  public claimVoucher(voucherId: string, now: number, leaseUntil: number, updatedAt: string) {
    const result = this.db
      .prepare(
        `UPDATE vouchers SET status = 'SETTLING', lease_until = ?, updated_at = ?
         WHERE voucher_id = ? AND lease_until <= ?
           AND status IN ('ACCEPTED', 'RETRYABLE_FAILURE', 'SETTLING')`
      )
      .run(leaseUntil, updatedAt, voucherId, now);
    return result.changes === 1;
  }

  public updateVoucher(
    voucherId: string,
    fields: Partial<
      Pick<VoucherRow, 'status' | 'capture_id' | 'failure' | 'attempts' | 'next_attempt_at'>
    >,
    updatedAt: string
  ) {
    const entries = Object.entries(fields);
    const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
    this.db
      .prepare(`UPDATE vouchers SET ${assignments}, lease_until = 0, updated_at = ? WHERE voucher_id = ?`)
      .run(...entries.map(([, value]) => value as string | number | null), updatedAt, voucherId);
  }

  public listVouchersForDevice(deviceId: string) {
    return this.db
      .prepare(
        `SELECT * FROM vouchers WHERE device_id = ? OR payee_device_id = ?
         ORDER BY created_at DESC, rowid DESC`
      )
      .all(deviceId, deviceId) as unknown as VoucherRow[];
  }

  public listVaultVouchers(vaultId: string) {
    return this.db
      .prepare('SELECT * FROM vouchers WHERE vault_id = ? ORDER BY sequence')
      .all(vaultId) as unknown as VoucherRow[];
  }

  public listDueVouchers(now: number) {
    return this.db
      .prepare(
        `SELECT * FROM vouchers
         WHERE lease_until <= ? AND next_attempt_at <= ?
           AND status IN ('ACCEPTED', 'RETRYABLE_FAILURE', 'SETTLING')`
      )
      .all(now, now) as unknown as VoucherRow[];
  }

  /** Reserved means holding capacity but not yet final; settled means captured at PayPal. */
  public vaultUsage(vaultId: string) {
    const placeholders = HOLDING_STATUSES.map(() => '?').join(', ');
    const sum = (where: string, ...values: string[]) =>
      (
        this.db
          .prepare(
            `SELECT COALESCE(SUM(amount_usd_minor), 0) AS total FROM vouchers
             WHERE vault_id = ? AND ${where}`
          )
          .get(vaultId, ...values) as { total: number }
      ).total;
    return {
      reservedUsdMinor: sum(`status IN (${placeholders})`, ...HOLDING_STATUSES),
      settledUsdMinor: sum(`status = 'SETTLED'`),
    };
  }

  public insertLedgerEntry(entry: LedgerRow) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ledger_entries (entry_id, device_id, voucher_id, amount_ngn_minor,
           amount_usd_minor, capture_id, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.entry_id,
        entry.device_id,
        entry.voucher_id,
        entry.amount_ngn_minor,
        entry.amount_usd_minor,
        entry.capture_id,
        entry.kind,
        entry.created_at
      );
  }

  public listLedger(deviceId: string) {
    return this.db
      .prepare('SELECT * FROM ledger_entries WHERE device_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(deviceId) as unknown as LedgerRow[];
  }

  /** Returns false if the event was already recorded. */
  public recordWebhookEvent(eventId: string, receivedAt: string) {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO webhook_events (event_id, received_at) VALUES (?, ?)')
      .run(eventId, receivedAt);
    return result.changes === 1;
  }

  public raiseAlert(kind: string, detail: string, vaultId: string | null, voucherId: string | null, at: string) {
    this.db
      .prepare('INSERT INTO alerts (vault_id, voucher_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(vaultId, voucherId, kind, detail, at);
    console.warn(`[alert] ${kind}: ${detail}`);
  }

  public listAlerts() {
    return this.db.prepare('SELECT * FROM alerts ORDER BY alert_id').all() as unknown as {
      kind: string;
      detail: string;
      vault_id: string | null;
      voucher_id: string | null;
    }[];
  }
}
