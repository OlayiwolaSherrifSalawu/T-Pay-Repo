import { useState } from 'react';
import { motion } from 'motion/react';
import { X, ArrowUpRight, ArrowDownLeft, QrCode, Copy, Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { BankAccount } from '../types/banking';
import { soundEffects } from '../utils/audio';
import confetti from 'canvas-confetti';

interface SendReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  activeAccountIndex: number;
  onSendTransfer: (fromAccountId: string, toName: string, toAcct: string, amount: number, bank: string) => void;
  onOpenNearbyScan: () => void;
}

export function SendReceiveModal({
  isOpen,
  onClose,
  accounts,
  activeAccountIndex,
  onSendTransfer,
  onOpenNearbyScan,
}: SendReceiveModalProps) {
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[activeAccountIndex]?.id || accounts[0].id);
  const [recipientName, setRecipientName] = useState('');
  const [recipientAcct, setRecipientAcct] = useState('');
  const [recipientBank, setRecipientBank] = useState('T-Pay Wallet');
  const [amount, setAmount] = useState('5000');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentSelectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!recipientAcct || isNaN(num) || num <= 0 || num > currentSelectedAccount.availableBalance) return;

    soundEffects.playCoinSound();

    try {
      confetti({
        particleCount: 25,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#dc2626', '#10b981', '#ffffff'],
      });
    } catch {}

    onSendTransfer(
      currentSelectedAccount.id,
      recipientName || 'Beneficiary',
      recipientAcct,
      num,
      recipientBank
    );
    onClose();
  };

  const handleCopyDetails = () => {
    const details = `Zenith Bank Plc\nAccount Name: Malik Olajuwon\nAccount Number: ${currentSelectedAccount.accountNumber}`;
    navigator.clipboard?.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl overflow-hidden"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Segmented Tab: Send vs Receive */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-5 max-w-[280px]">
          <button
            onClick={() => setActiveTab('send')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'send'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Send Money</span>
          </button>
          <button
            onClick={() => setActiveTab('receive')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'receive'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Receive</span>
          </button>
        </div>

        {/* TAB 1: SEND MONEY */}
        {activeTab === 'send' && (
          <form onSubmit={handleSend} className="space-y-4">
            {/* Source Account Picker */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Debit From Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name} ({acct.accountNumber}) · Available: ₦{acct.availableBalance.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Offline Scanning Shortcut if Offline Checking selected */}
            {currentSelectedAccount.type === 'offline_checking' && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-between text-xs">
                <span className="text-red-300">Have a nearby person ready?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenNearbyScan();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold"
                >
                  Bluetooth Radar
                </button>
              </div>
            )}

            {/* Destination Bank & Account Number */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Destination</label>
                <select
                  value={recipientBank}
                  onChange={(e) => setRecipientBank(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                >
                  <option value="T-Pay Wallet">T-Pay Account</option>
                  <option value="PayPal">PayPal (Global / Escrow)</option>
                  <option value="GTBank">GTBank Plc</option>
                  <option value="Access Bank">Access Bank Plc</option>
                  <option value="First Bank">First Bank</option>
                  <option value="OPay">OPay Digital</option>
                  <option value="Kuda">Kuda Microfinance</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Account Number</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={recipientAcct}
                  onChange={(e) => setRecipientAcct(e.target.value)}
                  placeholder="0123456789"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* Recipient Name (auto verified or manual) */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Recipient Name (Beneficiary)
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Babatunde Raji"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Amount (NGN)
              </label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2"
            >
              <span>Transfer ₦{Number(amount || 0).toLocaleString()} Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* TAB 2: RECEIVE MONEY */}
        {activeTab === 'receive' && (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-700 text-white flex items-center justify-center mx-auto font-black text-xl shadow-lg shadow-red-700/40">
                T
              </div>

              <div>
                <div className="text-xs text-slate-400">Account Name</div>
                <div className="text-sm font-bold text-white uppercase">Malik Olajuwon</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">T-Pay Account Number</div>
                <div className="text-2xl font-mono font-black text-red-400 tracking-wider">
                  {currentSelectedAccount.accountNumber}
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                {currentSelectedAccount.name} · T-Pay sample account
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyDetails}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Account Details Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Complete Account Details</span>
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
