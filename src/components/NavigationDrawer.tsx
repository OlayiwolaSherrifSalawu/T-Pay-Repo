import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  History,
  Settings,
  ShieldCheck,
  Radio,
  LogOut,
  ChevronRight,
  Award,
} from 'lucide-react';

export type AppView = 'dashboard' | 'tracker' | 'accounts' | 'history' | 'settings' | 'pitch';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onOpenPayPalEscrow?: () => void;
  user: {
    name: string;
    handle: string;
    tier: string;
  };
}

export function NavigationDrawer({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  onOpenPayPalEscrow,
  user,
}: NavigationDrawerProps) {
  const menuItems = [
    { id: 'accounts', label: 'Accounts', icon: CreditCard, desc: 'Swipable Cards (Checking, Savings, Offline)' },
    { id: 'tracker', label: 'Smart Tracker', icon: TrendingUp, desc: '3 Demo Cases (Merchant, User, Bus)' },
    { id: 'pitch', label: 'Pitch Deck', icon: Award, desc: 'PayPal Hackathon Presentation & Arch' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Executive Portfolio & Financial Overview' },
    { id: 'history', label: 'History', icon: History, desc: 'Full Searchable Transaction Ledger' },
    { id: 'settings', label: 'Settings', icon: Settings, desc: 'Security & connectivity controls' },
  ] as const;


  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-xs"
          />

          {/* Slide-in Drawer from Right */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="relative z-10 w-full max-w-xs h-full bg-slate-900 border-l border-slate-800 text-white shadow-2xl flex flex-col justify-between p-6 select-none"
          >
            <div>
              {/* Drawer Header & Close Button */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-800 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-rose-700 flex items-center justify-center font-black text-white text-base shadow-md shadow-red-700/40">
                    T
                  </div>
                  <span className="font-extrabold tracking-tight text-white text-base">T-PAY</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                  title="Close Menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Summary */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-700 to-red-500 flex items-center justify-center font-bold text-white shadow-md shadow-red-700/30">
                    MO
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{user.name}</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="text-xs font-mono text-slate-400">{user.handle}</div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-mono">KYC STATUS</span>
                  <span className="font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    {user.tier}
                  </span>
                </div>
              </div>

              {/* Navigation Options List */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 px-2 mb-2">
                  Navigation
                </div>

                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectView(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left group ${
                        isActive
                          ? 'bg-red-600 text-white font-semibold shadow-md shadow-red-600/30'
                          : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-red-400'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold">{item.label}</div>
                          <div
                            className={`text-[10px] ${
                              isActive ? 'text-white/80' : 'text-slate-500'
                            }`}
                          >
                            {item.desc}
                          </div>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 ${
                          isActive ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* PayPal Offline Escrow Hub Button */}
              {onOpenPayPalEscrow && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenPayPalEscrow();
                    }}
                    className="w-full p-3 rounded-2xl bg-gradient-to-r from-sky-950/80 to-blue-950/80 border border-sky-800/80 hover:border-sky-500 text-left transition group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                          P
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white group-hover:text-sky-300">
                            PayPal Offline Escrow
                          </div>
                          <div className="text-[10px] text-slate-400">The Big Gun · Zero-Data Sync</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition" />
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Footer with Mesh Status */}
            <div className="pt-4 border-t border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                  <span>PayPal sandbox</span>
                </div>
                <span className="font-mono text-slate-500">v2.4.0</span>
              </div>
              <div className="text-[10px] text-slate-500">
                T-Pay Universal · iOS & Android Ready
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
