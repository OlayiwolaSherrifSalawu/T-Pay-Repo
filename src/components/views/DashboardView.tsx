import React from 'react';
import { TrendingUp, TrendingDown, Wallet, ShieldCheck, ArrowRight, Radio, ArrowUpRight } from 'lucide-react';
import { BankAccount } from '../../types/banking';

interface DashboardViewProps {
  accounts: BankAccount[];
  onNavigateToAccounts: () => void;
  onNavigateToTracker: () => void;
  onNavigateToHistory: () => void;
}

export function DashboardView({
  accounts,
  onNavigateToAccounts,
  onNavigateToTracker,
  onNavigateToHistory,
}: DashboardViewProps) {
  // Aggregate total net worth across all 3 accounts
  const totalNetWorth = accounts.reduce((acc, a) => acc + a.availableBalance, 0);

  return (
    <div className="space-y-4 animate-fade-in text-white select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Executive Dashboard
          </h2>
          <p className="text-[11px] text-slate-400">Portfolio & Financial Health Overview</p>
        </div>
        <button
          onClick={onNavigateToAccounts}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-md transition"
        >
          <span>Open Accounts</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Aggregate Net Worth Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-neutral-900 to-red-950 p-6 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Wallet className="w-4 h-4 text-red-500" />
            <span>Total Liquid Portfolio</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
            3 Accounts Active
          </span>
        </div>

        <div className="text-3xl font-extrabold font-mono text-white tabular-nums tracking-tight">
          ₦{totalNetWorth.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          <span className="text-emerald-400 font-semibold font-mono">+₦36,380.00 (+7.4%)</span>
          <span>net growth this month</span>
        </div>

        {/* Quick balance allocation across 3 accounts */}
        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/10 text-xs">
          {accounts.map((acct) => (
            <div key={acct.id} className="bg-black/30 p-2.5 rounded-xl border border-white/5">
              <div className="text-[10px] text-slate-400 truncate">{acct.name}</div>
              <div className="font-mono text-xs font-bold text-white mt-0.5 tabular-nums">
                ₦{(acct.availableBalance / 1000).toFixed(1)}k
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Cash Flow Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>October Inflow</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
            +₦184,000.00
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Salary & Direct Inflows</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            <span>October Outflow</span>
          </div>
          <div className="text-xl font-bold font-mono text-slate-200 tabular-nums">
            -₦148,000.00
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Transit, Bills & P2P</div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="space-y-2">
        <div
          onClick={onNavigateToAccounts}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/60 transition cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center font-bold">
              T
            </div>
            <div>
              <div className="text-xs font-bold text-white group-hover:text-red-400 transition">
                Swipable Accounts Hub
              </div>
              <div className="text-[11px] text-slate-400">
                Checking, Savings, and Offline Checking cards
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
        </div>

        <div
          onClick={onNavigateToTracker}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/60 transition cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              📊
            </div>
            <div>
              <div className="text-xs font-bold text-white group-hover:text-blue-400 transition">
                Expense & Transit Tracker
              </div>
              <div className="text-[11px] text-slate-400">
                Category distribution and budget caps
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
        </div>

        <div
          onClick={onNavigateToHistory}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/60 transition cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
              📜
            </div>
            <div>
              <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition">
                Full Transaction History
              </div>
              <div className="text-[11px] text-slate-400">
                Search, filter and get receipts
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
        </div>
      </div>
    </div>
  );
}
