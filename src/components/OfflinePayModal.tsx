import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Lock,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { SignedVoucher } from '../../core/voucher/voucher';
import type { LocalVoucher, VaultSummary } from '../tpay/wallet';
import type { useWallet } from '../tpay/useWallet';
import { QrDisplay, QrScanner } from './QrExchange';

export type PayTab = 'vault' | 'pay' | 'receive' | 'activity';

export interface PayDraft {
  amountNgn: number;
  memo: string;
}

interface OfflinePayModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: ReturnType<typeof useWallet>;
  initialTab: PayTab;
  draft: PayDraft | null;
}

const PAYEE_PREFIX = 'TPAY-PAYEE:';
const VOUCHER_PREFIX = 'TPAY-VOUCHER:';
const PRESET_AMOUNTS = [5_000, 15_000, 30_000];

const naira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;
const usd = (minor: number) => `$${(minor / 100).toFixed(2)}`;

const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  SIGNED: { text: 'Waiting to settle', tone: 'text-amber-300' },
  PENDING_CREDIT: { text: 'Pending credit', tone: 'text-amber-300' },
  ACCEPTED: { text: 'Settling', tone: 'text-sky-300' },
  SETTLING: { text: 'Settling', tone: 'text-sky-300' },
  RETRYABLE_FAILURE: { text: 'Retrying', tone: 'text-sky-300' },
  PENDING_CAPTURE: { text: 'PayPal is reviewing', tone: 'text-sky-300' },
  SETTLED: { text: 'Settled', tone: 'text-emerald-400' },
  SETTLEMENT_BLOCKED: { text: 'Needs attention', tone: 'text-red-400' },
  DECLINED: { text: 'Declined', tone: 'text-red-400' },
  REVERSED: { text: 'Reversed', tone: 'text-red-400' },
  REJECTED: { text: 'Rejected', tone: 'text-red-400' },
  REJECTED_OVERSPEND: { text: 'Over the vault limit', tone: 'text-red-400' },
};

function Button({
  children,
  onClick,
  disabled,
  tone = 'primary',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'quiet';
}) {
  const colours =
    tone === 'primary' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-slate-800 hover:bg-slate-700';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full min-h-11 rounded-xl ${colours} disabled:opacity-40 text-sm font-bold transition active:scale-[0.99]`}
    >
      {children}
    </button>
  );
}

function VaultMeter({ vault, remainingNgn }: { vault: VaultSummary; remainingNgn: number }) {
  const capacity = vault.capacityUsdMinor;
  const percent = (value: number) => `${(value / capacity) * 100}%`;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400">Left to spend offline</span>
        <span className="text-xl font-bold tabular-nums">{naira(remainingNgn)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
        <div className="bg-emerald-500" style={{ width: percent(vault.settledUsdMinor) }} />
        <div className="bg-amber-400" style={{ width: percent(vault.reservedUsdMinor) }} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-slate-500">Held at PayPal</dt>
          <dd className="font-mono">{usd(capacity)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Pending</dt>
          <dd className="font-mono text-amber-300">{usd(vault.reservedUsdMinor)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Captured</dt>
          <dd className="font-mono text-emerald-400">{usd(vault.settledUsdMinor)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-slate-500">
        Rate: {naira(vault.ngnMinorPerUsd / 100)} per $1 ({vault.fxSource}).
        {vault.expiresAt && ` Offline until ${new Date(vault.expiresAt).toLocaleString()}.`}
      </p>
    </div>
  );
}

function VaultTab({ wallet }: { wallet: OfflinePayModalProps['wallet'] }) {
  const { vault, remainingNgn, online } = wallet.state;
  const [amount, setAmount] = useState(PRESET_AMOUNTS[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (vault?.status === 'ACTIVE' || vault?.status === 'BLOCKED') {
    return (
      <div className="space-y-3">
        <VaultMeter vault={vault} remainingNgn={remainingNgn} />
        {vault.status === 'BLOCKED' && (
          <p className="text-xs text-red-400">This vault was blocked: {vault.blockedReason}</p>
        )}
        <Button tone="quiet" disabled={!online || busy} onClick={() => attempt(wallet.meltVault)}>
          Release the rest back to PayPal
        </Button>
        <p className="text-[11px] text-slate-500">
          This voids the hold at PayPal. It is refused while any payment you made has not settled.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Hold money at PayPal while you have signal, then spend it with no internet.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {PRESET_AMOUNTS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            aria-pressed={amount === preset}
            className={`min-h-11 rounded-xl text-xs font-bold border transition ${
              amount === preset
                ? 'bg-sky-600 border-sky-500'
                : 'bg-slate-950 border-slate-800 hover:border-slate-600'
            }`}
          >
            {naira(preset)}
          </button>
        ))}
      </div>
      <Button
        disabled={!online || busy}
        onClick={() => attempt(() => wallet.lockVault(amount))}
      >
        Approve {naira(amount)} with PayPal
      </Button>
      {!online && <p className="text-xs text-amber-400">Locking a vault needs a connection.</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function PayTabPanel({
  wallet,
  draft,
}: {
  wallet: OfflinePayModalProps['wallet'];
  draft: PayDraft | null;
}) {
  const { vault, remainingNgn } = wallet.state;
  const [payeeDeviceId, setPayeeDeviceId] = useState<string | null>(null);
  const [amount, setAmount] = useState(draft ? String(draft.amountNgn) : '');
  const [memo, setMemo] = useState(draft?.memo ?? '');
  const [voucher, setVoucher] = useState<SignedVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readPayee = useCallback((text: string) => {
    if (text.startsWith(PAYEE_PREFIX)) {
      setPayeeDeviceId(text.slice(PAYEE_PREFIX.length));
      setError(null);
    } else {
      setError('That is not a T-Pay receive code.');
    }
  }, []);

  if (vault?.status !== 'ACTIVE') {
    return <p className="text-sm text-slate-300">Lock a vault first, while you have signal.</p>;
  }

  if (voucher) {
    return (
      <div className="space-y-3">
        <QrDisplay
          value={VOUCHER_PREFIX + JSON.stringify(voucher)}
          label={`Show this to the person you are paying: ${naira(voucher.payload.amountNgnMinor / 100)}`}
        />
        <Button
          tone="quiet"
          onClick={() => {
            setVoucher(null);
            setPayeeDeviceId(null);
            setAmount('');
            setMemo('');
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  if (!payeeDeviceId) {
    return (
      <div className="space-y-3">
        <QrScanner
          prompt="Step 1 of 2. Ask the seller to open Receive, then scan their code."
          onResult={readPayee}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  const pay = async () => {
    setError(null);
    try {
      setVoucher(await wallet.pay(payeeDeviceId, Number(amount), memo));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Step 2 of 2. You can spend up to {naira(remainingNgn)}.</p>
      <label className="block text-xs text-slate-400">
        Amount in naira
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1 w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-lg font-bold text-white focus:outline-none focus:border-sky-500"
        />
      </label>
      <label className="block text-xs text-slate-400">
        What is it for?
        <input
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          maxLength={80}
          className="mt-1 w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500"
        />
      </label>
      <Button disabled={!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0} onClick={pay}>
        Sign payment
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function ReceiveTab({ wallet }: { wallet: OfflinePayModalProps['wallet'] }) {
  const { deviceId } = wallet.state;
  const [received, setReceived] = useState<LocalVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readVoucher = useCallback(
    async (text: string) => {
      setError(null);
      setReceived(null);
      if (!text.startsWith(VOUCHER_PREFIX)) {
        setError('That is not a T-Pay payment code.');
        return;
      }
      try {
        setReceived(await wallet.receive(JSON.parse(text.slice(VOUCHER_PREFIX.length))));
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [wallet]
  );

  if (!deviceId) return null;

  return (
    <div className="space-y-5">
      <QrDisplay value={PAYEE_PREFIX + deviceId} label="Step 1. Let the buyer scan this." />
      <QrScanner prompt="Step 2. Scan the payment code they show you." onResult={readVoucher} />
      {received && (
        <p className="text-sm text-emerald-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          Signature verified offline: {naira(received.voucher.payload.amountNgnMinor / 100)} pending.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function ActivityTab({ wallet }: { wallet: OfflinePayModalProps['wallet'] }) {
  const { vouchers, balanceNgnMinor } = wallet.state;
  return (
    <div className="space-y-3">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-baseline justify-between">
        <span className="text-xs text-slate-400">Settled to you</span>
        <span className="text-xl font-bold tabular-nums">{naira(balanceNgnMinor / 100)}</span>
      </div>
      {vouchers.length === 0 && (
        <p className="text-sm text-slate-400">Payments you make or receive will show here.</p>
      )}
      <ul className="space-y-2">
        {vouchers.map(({ voucher, role, status, captureId, failure }) => {
          const label = STATUS_LABELS[status] ?? { text: status, tone: 'text-slate-300' };
          const incoming = role === 'PAYEE';
          return (
            <li
              key={voucher.payload.voucherId}
              className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold min-w-0">
                  {incoming ? (
                    <ArrowDownLeft className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{voucher.payload.memo || (incoming ? 'Received' : 'Paid')}</span>
                </span>
                <span className="font-bold tabular-nums">
                  {naira(voucher.payload.amountNgnMinor / 100)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={label.tone}>{label.text}</span>
                <span className="text-slate-500">{usd(voucher.payload.amountUsdMinor)}</span>
              </div>
              {captureId && (
                <p className="text-[11px] text-slate-500 font-mono break-all select-text">
                  PayPal capture {captureId}
                </p>
              )}
              {failure && <p className="text-[11px] text-red-400">{failure}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TABS: { id: PayTab; label: string; icon: typeof Lock }[] = [
  { id: 'vault', label: 'Vault', icon: Lock },
  { id: 'pay', label: 'Pay', icon: ArrowUpRight },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
  { id: 'activity', label: 'Activity', icon: History },
];

export function OfflinePayModal({ isOpen, onClose, wallet, initialTab, draft }: OfflinePayModalProps) {
  const [tab, setTab] = useState<PayTab>(initialTab);
  const { online, error, slot } = wallet.state;

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white shadow-2xl max-h-[92vh] flex flex-col"
      >
        <header className="flex items-center justify-between pb-3 shrink-0">
          <div>
            <h2 className="text-base font-bold">Offline payments</h2>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
              {online ? 'Online' : 'Offline'} · Device {slot.toUpperCase()} · Software key · PayPal sandbox
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <nav className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-2xl shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`min-h-11 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center transition ${
                tab === id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="overflow-y-auto pt-4 pb-1 min-h-0">
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          {tab === 'vault' && <VaultTab wallet={wallet} />}
          {tab === 'pay' && <PayTabPanel wallet={wallet} draft={draft} />}
          {tab === 'receive' && <ReceiveTab wallet={wallet} />}
          {tab === 'activity' && <ActivityTab wallet={wallet} />}
        </div>
      </motion.div>
    </div>
  );
}
