import { useCallback, useEffect, useState } from 'react';
import { Wallet, WalletError, type KeyValueStore, type LocalVoucher, type VaultSummary } from './wallet';

const SYNC_INTERVAL_MS = 10_000;

/** One IndexedDB database per simulated device, so two tabs can act as two phones. */
function openStore(name: string): KeyValueStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const run = async <T,>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await database;
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('kv', mode);
      const request = work(transaction.objectStore('kv'));
      // Resolving on commit, not on success, is what makes a write survive a crash.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  };

  return {
    get: <T,>(key: string) => run<T | undefined>('readonly', (store) => store.get(key)),
    set: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key));
    },
  };
}

/** The device survives the redirect to PayPal and back, which drops the query string. */
function deviceSlot() {
  const fromUrl = new URLSearchParams(location.search).get('device');
  if (fromUrl) sessionStorage.setItem('tpay-device', fromUrl);
  return fromUrl ?? sessionStorage.getItem('tpay-device') ?? 'a';
}

const slot = deviceSlot();
const wallet = new Wallet(openStore(`tpay-wallet-${slot}`), '/api/v1');

export interface WalletState {
  ready: boolean;
  slot: string;
  deviceId: string | null;
  online: boolean;
  vault: VaultSummary | null;
  remainingNgn: number;
  vouchers: LocalVoucher[];
  balanceNgnMinor: number;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    ready: false,
    slot,
    deviceId: null,
    online: navigator.onLine,
    vault: null,
    remainingNgn: 0,
    vouchers: [],
    balanceNgnMinor: 0,
    error: null,
  });

  const load = useCallback(async () => {
    const vault = await wallet.cachedVault();
    const remainingUsdMinor = await wallet.remainingOfflineUsdMinor();
    const rate = vault?.certificate?.payload.ngnMinorPerUsd ?? 0;
    const vouchers = await wallet.listVouchers();
    setState((previous) => ({
      ...previous,
      ready: true,
      deviceId: wallet.deviceId,
      vault,
      remainingNgn: Math.floor((remainingUsdMinor * rate) / 10_000),
      vouchers,
    }));
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      await wallet.sync();
      const { balanceNgnMinor } = await wallet.ledger();
      setState((previous) => ({ ...previous, balanceNgnMinor, error: null }));
    } catch (error) {
      if (error instanceof WalletError) {
        setState((previous) => ({ ...previous, error: error.message }));
      }
      // A failed fetch just means the network is not really back yet: the next tick retries.
    }
    await load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        await wallet.register();
      } catch {
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            error: 'Connect to the internet once to set up this device.',
          }));
        }
        return;
      }

      const params = new URLSearchParams(location.search);
      const returningVault = params.get('vault');
      if (returningVault && params.get('paypal') === 'approved') {
        try {
          await wallet.completeVault(returningVault);
        } catch (error) {
          setState((previous) => ({ ...previous, error: (error as Error).message }));
        }
      }
      if (returningVault) history.replaceState(null, '', location.pathname);

      await load();
      await sync();
    };
    void start();

    const goOnline = () => {
      setState((previous) => ({ ...previous, online: true }));
      void sync();
    };
    const goOffline = () => setState((previous) => ({ ...previous, online: false }));
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const timer = setInterval(() => void sync(), SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(timer);
    };
  }, [load, sync]);

  const run = useCallback(
    async <T,>(work: () => Promise<T>) => {
      const result = await work();
      await load();
      return result;
    },
    [load]
  );

  return {
    state,
    sync,
    lockVault: async (amountNgn: number) => {
      const { approveUrl } = await wallet.lockVault(amountNgn * 100);
      location.href = approveUrl;
    },
    meltVault: async () => {
      await run(() => wallet.meltVault());
      await sync();
    },
    pay: (payeeDeviceId: string, amountNgn: number, memo: string) =>
      run(() => wallet.pay(payeeDeviceId, amountNgn * 100, memo)),
    receive: (voucher: Parameters<Wallet['receive']>[0]) => run(() => wallet.receive(voucher)),
    interpret: (transcript: string, language: string, inventory: unknown[]) =>
      wallet.interpret(transcript, language, inventory),
  };
}
