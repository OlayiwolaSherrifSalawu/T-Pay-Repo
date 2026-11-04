import {
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  keyIdOf,
  signRegistration,
  signVoucher,
  toUsdMinor,
  verifyVoucher,
  type SignedVoucher,
  type VaultCertificate,
  type VerificationFailure,
} from '../../core/voucher/voucher';

/** Durable local storage. IndexedDB in the browser; a Map in tests. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface VaultSummary {
  vaultId: string;
  status: string;
  blockedReason: string | null;
  capacityUsdMinor: number;
  capacityNgnMinor: number;
  reservedUsdMinor: number;
  settledUsdMinor: number;
  remainingUsdMinor: number;
  ngnMinorPerUsd: number;
  fxSource: string;
  expiresAt: string | null;
  certificate: VaultCertificate | null;
}

export type VoucherRole = 'PAYER' | 'PAYEE';

export interface LocalVoucher {
  voucher: SignedVoucher;
  role: VoucherRole;
  /** The local state until the backend, the only authority on settlement, reports one. */
  status: string;
  captureId: string | null;
  failure: string | null;
}

interface Identity {
  privateKey: CryptoKey;
  publicKey: JsonWebKey;
  keyId: string;
  deviceId: string;
  token: string;
}

export class WalletError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const VOUCHERS_KEY = 'vouchers';

export class Wallet {
  private readonly store: KeyValueStore;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private identity: Identity | null = null;

  constructor(
    store: KeyValueStore,
    baseUrl: string,
    fetcher: typeof fetch = (...args) => fetch(...args),
    now: () => Date = () => new Date()
  ) {
    this.store = store;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.now = now;
  }

  private async api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as {
      data: T;
      error?: { code: string; message: string };
    };
    if (!response.ok) {
      throw new WalletError(json.error?.code ?? 'REQUEST_FAILED', json.error?.message ?? 'Request failed');
    }
    return json.data;
  }

  private authed<T>(method: string, path: string, body?: unknown) {
    return this.api<T>(method, path, body, this.requireIdentity().token);
  }

  private requireIdentity() {
    if (!this.identity) throw new WalletError('NOT_REGISTERED', 'This device is not registered yet');
    return this.identity;
  }

  /** Reuses the stored key across restarts. The private key is not extractable. */
  public async register() {
    const stored = await this.store.get<Identity>('identity');
    if (stored) {
      this.identity = stored;
      return stored.deviceId;
    }

    const pair = await generateKeyPair(false);
    const publicKey = await exportPublicKey(pair.publicKey);
    const keyId = await keyIdOf(publicKey);
    const issuedAt = this.now().toISOString();
    const proof = await signRegistration(pair.privateKey, keyId, issuedAt);
    const { deviceId, token } = await this.api<{ deviceId: string; token: string }>(
      'POST',
      '/devices/register',
      { publicKey, issuedAt, proof }
    );

    const { publicKey: issuerKey } = await this.api<{ publicKey: JsonWebKey }>('GET', '/issuer-key');
    await this.store.set('issuerKey', issuerKey);

    this.identity = { privateKey: pair.privateKey, publicKey, keyId, deviceId, token };
    await this.store.set('identity', this.identity);
    return deviceId;
  }

  public get deviceId() {
    return this.requireIdentity().deviceId;
  }

  public async lockVault(amountNgnMinor: number) {
    return this.authed<{ vaultId: string; approveUrl: string }>('POST', '/vaults', { amountNgnMinor });
  }

  public async completeVault(vaultId: string) {
    const vault = await this.authed<VaultSummary>('POST', `/vaults/${vaultId}/authorize`);
    await this.cacheVault(vault);
    return vault;
  }

  /** Keeps the certificate on the device: it is what makes paying offline possible. */
  private async cacheVault(vault: VaultSummary) {
    await this.store.set('vault', vault);
  }

  public async refreshVault() {
    const vault = await this.authed<VaultSummary | null>('GET', '/vaults/current');
    if (vault) await this.cacheVault(vault);
    else await this.store.set('vault', null);
    return vault;
  }

  public async cachedVault() {
    return (await this.store.get<VaultSummary | null>('vault')) ?? null;
  }

  private async vouchers() {
    return (await this.store.get<Record<string, LocalVoucher>>(VOUCHERS_KEY)) ?? {};
  }

  public async listVouchers() {
    return Object.values(await this.vouchers()).sort((a, b) =>
      b.voucher.payload.issuedAt.localeCompare(a.voucher.payload.issuedAt)
    );
  }

  private async saveVoucher(entry: LocalVoucher) {
    const all = await this.vouchers();
    all[entry.voucher.payload.voucherId] = entry;
    await this.store.set(VOUCHERS_KEY, all);
  }

  /** Spent on this device: everything it signed, whether or not the backend has seen it. */
  public async remainingOfflineUsdMinor() {
    const vault = await this.cachedVault();
    if (!vault?.certificate) return 0;
    const vaultId = vault.certificate.payload.vaultId;
    const released = new Set(['DECLINED', 'REVERSED']);
    const spent = (await this.listVouchers())
      .filter(
        (entry) =>
          entry.role === 'PAYER' &&
          entry.voucher.payload.vaultId === vaultId &&
          !released.has(entry.status)
      )
      .reduce((total, entry) => total + entry.voucher.payload.amountUsdMinor, 0);
    return vault.certificate.payload.capacityUsdMinor - spent;
  }

  /**
   * Refuses before any signature exists. The sequence is written before signing, so
   * a crash mid-payment wastes a number rather than ever reusing one.
   */
  public async pay(payeeDeviceId: string, amountNgnMinor: number, memo: string) {
    const identity = this.requireIdentity();
    const vault = await this.cachedVault();
    if (!vault?.certificate || vault.status !== 'ACTIVE') {
      throw new WalletError('NO_VAULT', 'Lock a vault while online before paying offline');
    }

    const certificate = vault.certificate;
    const now = this.now();
    if (now.getTime() >= new Date(certificate.payload.expiresAt).getTime()) {
      throw new WalletError('VAULT_EXPIRED', 'This vault has expired. Reconnect to lock a new one');
    }

    const rate = certificate.payload.ngnMinorPerUsd;
    const amountUsdMinor = toUsdMinor(amountNgnMinor, rate);
    const remaining = await this.remainingOfflineUsdMinor();
    if (amountUsdMinor > remaining) {
      const remainingNgn = Math.floor((remaining * rate) / 10_000);
      throw new WalletError('OVER_CAPACITY', `Only ₦${remainingNgn.toLocaleString('en-NG')} left in the vault`);
    }

    const sequenceKey = `sequence:${certificate.payload.vaultId}`;
    const sequence = ((await this.store.get<number>(sequenceKey)) ?? 0) + 1;
    await this.store.set(sequenceKey, sequence);

    const payload = {
      voucherId: crypto.randomUUID(),
      vaultId: certificate.payload.vaultId,
      deviceId: identity.deviceId,
      keyId: identity.keyId,
      sequence,
      amountNgnMinor,
      amountUsdMinor,
      ngnMinorPerUsd: rate,
      payeeDeviceId,
      memo: memo.slice(0, 80),
      issuedAt: now.toISOString(),
      expiresAt: certificate.payload.expiresAt,
    };
    const voucher: SignedVoucher = {
      payload,
      signature: await signVoucher(identity.privateKey, payload),
      certificate,
    };
    await this.saveVoucher({ voucher, role: 'PAYER', status: 'SIGNED', captureId: null, failure: null });
    return voucher;
  }

  /** Works with no network. A voucher that fails here is never shown as money received. */
  public async receive(voucher: SignedVoucher) {
    const identity = this.requireIdentity();
    if (voucher.payload.payeeDeviceId !== identity.deviceId) {
      throw new WalletError('WRONG_PAYEE', 'This voucher was made out to a different device');
    }
    const existing = (await this.vouchers())[voucher.payload.voucherId];
    if (existing) return existing;

    const issuerJwk = await this.store.get<JsonWebKey>('issuerKey');
    if (!issuerJwk) throw new WalletError('NO_ISSUER_KEY', 'Connect once to finish setting up');
    const verdict = await verifyVoucher(voucher, await importPublicKey(issuerJwk), this.now());
    if (!verdict.ok) {
      const reason: VerificationFailure = verdict.reason;
      throw new WalletError(reason, `This voucher cannot be accepted: ${reason}`);
    }

    const entry: LocalVoucher = {
      voucher,
      role: 'PAYEE',
      status: 'PENDING_CREDIT',
      captureId: null,
      failure: null,
    };
    await this.saveVoucher(entry);
    return entry;
  }

  /**
   * Runs on reconnect with no user action. Either party may submit: the backend
   * deduplicates, so whichever device gets a network first settles for both.
   */
  public async sync() {
    const terminal = new Set(['SETTLED', 'DECLINED', 'REVERSED', 'REJECTED_OVERSPEND']);
    for (const entry of await this.listVouchers()) {
      if (terminal.has(entry.status)) continue;
      try {
        const result = await this.authed<{
          status: string;
          captureId: string | null;
          failure: string | null;
        }>('POST', '/vouchers', entry.voucher);
        await this.saveVoucher({ ...entry, ...result });
      } catch (error) {
        if (error instanceof WalletError) {
          await this.saveVoucher({ ...entry, status: 'REJECTED', failure: error.code });
          continue;
        }
        throw error;
      }
    }
    return this.refreshVault();
  }

  public async meltVault() {
    const vault = await this.cachedVault();
    if (!vault) throw new WalletError('NO_VAULT', 'There is no vault to melt');
    const lastIssuedSequence = (await this.store.get<number>(`sequence:${vault.vaultId}`)) ?? 0;
    const melted = await this.authed<VaultSummary>('POST', `/vaults/${vault.vaultId}/melt`, {
      lastIssuedSequence,
    });
    await this.store.set('vault', null);
    return melted;
  }

  public ledger() {
    return this.authed<{ balanceNgnMinor: number; entries: { capture_id: string }[] }>('GET', '/ledger');
  }

  public interpret(transcript: string, language: string, inventory: unknown[]) {
    return this.authed<{
      allowed: boolean;
      reason?: string;
      proposal: {
        action: string;
        amountNgn: number | null;
        item: string | null;
        payeeName: string | null;
        reply: string;
      };
    }>('POST', '/assistant/interpret', { transcript, language, inventory });
  }
}
