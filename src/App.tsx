import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Eye,
  EyeOff,
  Smartphone,
  Zap,
  Radio,
  QrCode,
  ShieldCheck,
  CreditCard,
  Send,
  ArrowRight,
  CheckCircle2,
  Lock,
  Layers,
  HelpCircle,
  X,
  Menu,
  Award,
} from 'lucide-react';
import { BankAccount, BankTransaction } from './types/banking';
import { INITIAL_ACCOUNTS, INITIAL_BANK_TRANSACTIONS } from './data/bankingData';
import { AccountCarousel } from './components/AccountCarousel';
import { CenterSendReceiveButton } from './components/CenterSendReceiveButton';
import { SendReceiveModal } from './components/SendReceiveModal';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { TransactionList } from './components/TransactionList';
import { NavigationDrawer, AppView } from './components/NavigationDrawer';
import { DashboardView } from './components/views/DashboardView';
import { TrackerView } from './components/views/TrackerView';
import { HistoryView } from './components/views/HistoryView';
import { SettingsView } from './components/views/SettingsView';
import { OfflinePayModal, type PayDraft, type PayTab } from './components/OfflinePayModal';
import { useWallet } from './tpay/useWallet';
import { JudgePitchHub } from './components/JudgePitchHub';
import { soundEffects } from './utils/audio';


export default function App() {
  const [accounts, setAccounts] = useState<BankAccount[]>(INITIAL_ACCOUNTS);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [transactions, setTransactions] = useState<BankTransaction[]>(INITIAL_BANK_TRANSACTIONS);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('accounts');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Modals state
  const [isSendReceiveOpen, setIsSendReceiveOpen] = useState(false);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);
  const [voiceInitialPrompt, setVoiceInitialPrompt] = useState<string | undefined>(undefined);
  const wallet = useWallet();
  const [isOfflinePayOpen, setIsOfflinePayOpen] = useState(false);
  const [payTab, setPayTab] = useState<PayTab>('vault');
  const [payDraft, setPayDraft] = useState<PayDraft | null>(null);
  const [isAirtimeOpen, setIsAirtimeOpen] = useState(false);
  const [airtimePhone, setAirtimePhone] = useState('08034567890');
  const [airtimeAmount, setAirtimeAmount] = useState('2000');
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);

  const activeAccount = accounts[activeAccountIndex];

  const openOfflinePay = (tab: PayTab, draft: PayDraft | null = null) => {
    setPayTab(tab);
    setPayDraft(draft);
    setIsOfflinePayOpen(true);
  };

  // PayPal sends the payer back here after approving a vault, so show them the result.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('vault')) openOfflinePay('vault');
  }, []);

  // Transactions filtered to currently active swiped account
  const filteredTransactions = transactions.filter(
    (tx) => tx.accountId === activeAccount.id
  );

  const showAlert = (message: string) => {
    setBannerAlert(message);
    setTimeout(() => setBannerAlert(null), 3500);
  };

  // Handler for standard send transfer
  const handleSendTransfer = (
    fromAccountId: string,
    toName: string,
    toAcct: string,
    amount: number,
    bank: string
  ) => {
    setAccounts((prev) =>
      prev.map((acct) => {
        if (acct.id === fromAccountId) {
          return {
            ...acct,
            availableBalance: Math.max(0, acct.availableBalance - amount),
            ledgerBalance: Math.max(0, acct.ledgerBalance - amount),
          };
        }
        return acct;
      })
    );

    const newTx: BankTransaction = {
      id: `tx-${Date.now()}`,
      accountId: fromAccountId,
      title: `Transfer to ${toName}`,
      subtitle: `${bank} · ${toAcct}`,
      category: 'transfer',
      amount: -amount,
      currency: 'NGN',
      date: 'Today',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reference: `TPAY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      status: 'successful',
      recipient: {
        name: toName,
        accountNumber: toAcct,
        bankName: bank,
        method: 'nip_transfer',
      },
    };

    setTransactions((prev) => [newTx, ...prev]);
    showAlert(`₦${amount.toLocaleString()} sent to ${toName} (${toAcct}) successfully.`);
  };

  // Handler for Airtime purchase
  const handleBuyAirtime = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(airtimeAmount);
    if (isNaN(num) || num <= 0 || num > activeAccount.availableBalance) return;

    soundEffects.playCoinSound();
    setAccounts((prev) =>
      prev.map((acct) => {
        if (acct.id === activeAccount.id) {
          return {
            ...acct,
            availableBalance: Math.max(0, acct.availableBalance - num),
          };
        }
        return acct;
      })
    );

    const newTx: BankTransaction = {
      id: `tx-${Date.now()}`,
      accountId: activeAccount.id,
      title: `Airtime Top-Up for ${airtimePhone}`,
      subtitle: `Direct Debit · ${activeAccount.name}`,
      category: 'airtime',
      amount: -num,
      currency: 'NGN',
      date: 'Today',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reference: `VTU-${Math.floor(10000 + Math.random() * 90000)}`,
      status: 'successful',
    };

    setTransactions((prev) => [newTx, ...prev]);
    setIsAirtimeOpen(false);
    showAlert(`₦${num.toLocaleString()} airtime recharged for ${airtimePhone}!`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Toast Alert */}
      <AnimatePresence>
        {bannerAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 inset-x-0 mx-auto w-full max-w-sm z-50 px-4"
          >
            <div className="bg-red-950/95 border border-red-500/80 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between text-xs text-white backdrop-blur-md">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">{bannerAlert}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Single Page Banking App Viewport Container */}
      <div className="flex-1 w-full max-w-md mx-auto flex flex-col min-h-screen px-4 py-5 sm:px-6">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
          <div className="flex items-center gap-3">
            {/* User Profile Avatar with Online Beacon */}
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-700 to-red-500 flex items-center justify-center font-bold text-white shadow-md shadow-red-700/30 border border-red-400/40">
                MO
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950" />
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Good day,</span>
                <button
                  type="button"
                  onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                  className="text-slate-400 hover:text-white transition"
                  title="Toggle show/hide balances"
                >
                  {isBalanceHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <h1 className="text-sm font-bold text-white tracking-tight">
                Malik Olajuwon
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Judge Pitch Hub Quick Launcher */}
            <button
              onClick={() => setActiveView(activeView === 'pitch' ? 'accounts' : 'pitch')}
              className={`px-2 py-1.5 rounded-xl border transition active:scale-95 flex items-center gap-1.5 text-xs font-bold shadow-md ${
                activeView === 'pitch'
                  ? 'bg-red-600 border-red-500 text-white shadow-red-700/30'
                  : 'bg-amber-950/80 hover:bg-amber-900 border-amber-700/80 text-amber-300 hover:text-white shadow-amber-950/40'
              }`}
              title="PayPal Hackathon Pitch & Judge Showcase"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-[11px]">Pitch</span>
            </button>

            {/* PayPal Escrow Vault Quick Launcher */}
            <button
              onClick={() => openOfflinePay('vault')}
              className="px-2.5 py-1.5 rounded-xl bg-sky-950/90 hover:bg-sky-900 border border-sky-700/80 text-sky-300 hover:text-white transition active:scale-95 flex items-center gap-1.5 text-xs font-bold shadow-md shadow-sky-950/50"
              title="Offline payments"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline font-mono">PayPal</span>
            </button>


            <button
              onClick={() => setIsVoiceAssistantOpen(true)}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white transition active:scale-95"
              title="Voice Assistant"
            >
              <Zap className="w-4 h-4 text-red-500" />
            </button>
            <button
              onClick={() => showAlert('You have no unread security notifications.')}
              className="relative p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white transition active:scale-95"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600" />
            </button>

            {/* TOP-RIGHT HAMBURGER MENU BUTTON */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-400 hover:text-white transition active:scale-95 shadow-md shadow-red-700/20"
              title="Open Navigation Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* MULTI-VIEW RENDERING */}
        {activeView === 'accounts' ? (
          <div className="flex-1 flex flex-col">
            {/* 1. ACCOUNTS SECTION: SWIPABLE CHECKING, SAVINGS, AND OFFLINE CHECKING */}
            <div className="mb-4">
              <AccountCarousel
                accounts={accounts}
                activeIndex={activeAccountIndex}
                onSelectAccount={setActiveAccountIndex}
                isBalanceHidden={isBalanceHidden}
                onToggleHideBalance={() => setIsBalanceHidden(!isBalanceHidden)}
                onTriggerNearbyScan={() => openOfflinePay('pay')}
              />
            </div>

            {/* The product's core flow, so nobody has to hunt for it */}
            <button
              onClick={() => openOfflinePay(wallet.state.vault?.status === 'ACTIVE' ? 'pay' : 'vault')}
              className="w-full min-h-14 mb-3 px-4 py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 active:scale-[0.99] transition flex items-center justify-between text-left"
            >
              <span>
                <span className="block text-sm font-bold text-white">
                  {wallet.state.vault?.status === 'ACTIVE'
                    ? `₦${wallet.state.remainingNgn.toLocaleString('en-NG')} ready to spend offline`
                    : 'Get ready to pay with no internet'}
                </span>
                <span className="block text-[11px] text-sky-100">
                  Held at PayPal, signed on this phone, settled when you reconnect
                </span>
              </span>
              <ArrowRight className="w-5 h-5 text-white shrink-0" />
            </button>

            {/* 2. CENTER SEND-RECEIVE ACTION CIRCLE (THE SIGNATURE COMPONENT) */}
            <div className="py-1">
              <CenterSendReceiveButton
                onTap={() => setIsSendReceiveOpen(true)}
                onHoldToSpeak={() => setIsVoiceAssistantOpen(true)}
              />
            </div>

            {/* 3. QUICK BANKING SERVICES STRIP */}
            <div className="grid grid-cols-4 gap-2.5 my-3">
              <button
                onClick={() => setIsSendReceiveOpen(true)}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/50 active:scale-95 transition group"
              >
                <div className="w-9 h-9 rounded-xl bg-red-600/10 text-red-500 flex items-center justify-center mb-1.5 group-hover:bg-red-600 group-hover:text-white transition">
                  <Send className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-medium text-slate-300 text-center">Transfer</span>
              </button>

              <button
                onClick={() => openOfflinePay('pay')}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/50 active:scale-95 transition group"
              >
                <div className="w-9 h-9 rounded-xl bg-red-600/10 text-red-500 flex items-center justify-center mb-1.5 group-hover:bg-red-600 group-hover:text-white transition">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <span className="text-[11px] font-medium text-slate-300 text-center">Pay Offline</span>
              </button>

              <button
                onClick={() => setIsAirtimeOpen(true)}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/50 active:scale-95 transition group"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center mb-1.5 group-hover:bg-slate-700 transition">
                  <Smartphone className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-medium text-slate-300 text-center">Airtime</span>
              </button>

              <button
                onClick={() => {
                  showAlert('T-Pay QR Scanner initialized.');
                  setIsSendReceiveOpen(true);
                }}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/50 active:scale-95 transition group"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center mb-1.5 group-hover:bg-slate-700 transition">
                  <QrCode className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-medium text-slate-300 text-center">QR Pay</span>
              </button>
            </div>

            {/* 4. ACTIVITY FEED FILTERED TO CURRENTLY SWIPED ACCOUNT */}
            <div className="flex-1 mt-2 mb-6">
              <TransactionList
                transactions={filteredTransactions}
                accountName={activeAccount.name}
              />
            </div>
          </div>
        ) : activeView === 'dashboard' ? (
          <div className="flex-1 my-2">
            <DashboardView
              accounts={accounts}
              onNavigateToAccounts={() => setActiveView('accounts')}
              onNavigateToTracker={() => setActiveView('tracker')}
              onNavigateToHistory={() => setActiveView('history')}
            />
          </div>
        ) : activeView === 'tracker' ? (
          <div className="flex-1 my-2">
            <TrackerView
              onBackToDashboard={() => setActiveView('accounts')}
              onOpenVoiceAssistant={(prompt) => {
                setVoiceInitialPrompt(prompt);
                setIsVoiceAssistantOpen(true);
              }}
              onOpenPayPalEscrow={() => openOfflinePay('vault')}
            />
          </div>
        ) : activeView === 'history' ? (
          <div className="flex-1 my-2">
            <HistoryView
              transactions={transactions}
              onBackToDashboard={() => setActiveView('accounts')}
            />
          </div>
        ) : activeView === 'pitch' ? (
          <div className="flex-1 my-2">
            <JudgePitchHub
              onTriggerDemoScenario={(scenario) => {
                if (scenario === 'merchant_sale' || scenario === 'user_budget' || scenario === 'driver_bus') {
                  setActiveView('tracker');
                  showAlert(`Switched to Smart Resource Tracker for ${scenario.replace('_', ' ')}!`);
                } else if (scenario === 'vault_escrow') {
                  openOfflinePay('vault');
                }
              }}
              onResetDemoData={() => {
                setAccounts(INITIAL_ACCOUNTS);
                setTransactions(INITIAL_BANK_TRANSACTIONS);
                showAlert('Demo balances and transaction records restored to initial state.');
              }}
              onClose={() => setActiveView('accounts')}
            />
          </div>
        ) : (
          <div className="flex-1 my-2">
            <SettingsView onBackToDashboard={() => setActiveView('accounts')} />
          </div>
        )}


        {/* Bottom T-Pay Brand Footer */}
        <footer className="text-center text-[10px] text-slate-500 pt-3 border-t border-slate-900">
          <div>Hackathon prototype on the PayPal sandbox. No real money moves.</div>
          <div className="mt-0.5 text-slate-600">Bank balances on this screen are sample data.</div>
        </footer>
      </div>

      {/* NAVIGATION DRAWER (Slide-in from right when hamburger menu is tapped) */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          setIsDrawerOpen(false);
        }}
        onOpenPayPalEscrow={() => openOfflinePay('vault')}
        user={{
          name: 'Malik Olajuwon',
          handle: '@malik.tpay',
          tier: 'Tier 3 Verified',
        }}
      />

      {/* MODAL 1: Send & Receive Modal Sheet */}
      <SendReceiveModal
        isOpen={isSendReceiveOpen}
        onClose={() => setIsSendReceiveOpen(false)}
        accounts={accounts}
        activeAccountIndex={activeAccountIndex}
        onSendTransfer={handleSendTransfer}
        onOpenNearbyScan={() => openOfflinePay('pay')}
      />

      {/* MODAL 2: Hybrid AI Voice Assistant ("hold to speak") */}
      <VoiceAssistantModal
        isOpen={isVoiceAssistantOpen}
        onClose={() => {
          setIsVoiceAssistantOpen(false);
          setVoiceInitialPrompt(undefined);
        }}
        accounts={accounts}
        initialPrompt={voiceInitialPrompt}
        onExecuteVoiceTransfer={(fromType, toName, amount) => {
          const acct = accounts.find((a) => a.type === fromType) || accounts[0];
          handleSendTransfer(acct.id, toName, '0129384719', amount, 'T-Pay');
        }}
        onOpenNearbyScan={() => openOfflinePay('pay')}
        onOpenMarketVault={() => openOfflinePay('vault')}
        onInterpret={wallet.interpret}
        onConfirmPayment={(draft) => openOfflinePay('pay', draft)}
        onNavigateToTracker={() => {
          setActiveView('tracker');
        }}
      />

      {/* MODAL 3: Real offline payments */}
      <OfflinePayModal
        isOpen={isOfflinePayOpen}
        onClose={() => setIsOfflinePayOpen(false)}
        wallet={wallet}
        initialTab={payTab}
        draft={payDraft}
      />

      {/* MODAL 5: Quick Airtime Top-Up Modal */}
      {isAirtimeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl"
          >
            <button
              onClick={() => setIsAirtimeOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-white mb-1">Buy Airtime / Data</h3>
            <p className="text-xs text-slate-400 mb-4">
              Debit from {activeAccount.name}
            </p>
            <form onSubmit={handleBuyAirtime} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={airtimePhone}
                  onChange={(e) => setAirtimePhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Amount (NGN)</label>
                <input
                  type="number"
                  required
                  value={airtimeAmount}
                  onChange={(e) => setAirtimeAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs mt-2 transition"
              >
                Recharge ₦{Number(airtimeAmount || 0).toLocaleString()}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
