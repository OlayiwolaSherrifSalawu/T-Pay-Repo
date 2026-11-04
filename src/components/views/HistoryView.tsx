import { useState } from 'react';
import { ArrowLeft, Search, Filter, ArrowUpRight, ArrowDownLeft, Radio, Smartphone, CheckCircle2 } from 'lucide-react';
import { BankTransaction } from '../../types/banking';

interface HistoryViewProps {
  transactions: BankTransaction[];
  onBackToDashboard: () => void;
}

export function HistoryView({ transactions, onBackToDashboard }: HistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'inflow' | 'outflow' | 'offline'>('all');
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);

  const filtered = transactions.filter((tx) => {
    // Search filter
    const matchesSearch =
      tx.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.reference.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Type filter
    if (filterType === 'inflow') return tx.amount > 0;
    if (filterType === 'outflow') return tx.amount < 0 && tx.category !== 'offline_peer';
    if (filterType === 'offline') return tx.category === 'offline_peer';

    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in text-white select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <button
          onClick={onBackToDashboard}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Accounts</span>
        </button>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Transaction History
        </h2>
        <span className="text-[11px] font-mono text-slate-400">
          {filtered.length} Results
        </span>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by recipient, reference, or title..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800 text-xs">
        {(['all', 'inflow', 'outflow', 'offline'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`flex-1 py-1.5 rounded-xl font-medium text-[11px] uppercase transition ${
              filterType === type
                ? 'bg-red-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {type === 'all'
              ? 'All'
              : type === 'inflow'
              ? 'Inflow'
              : type === 'outflow'
              ? 'Outflow'
              : 'Offline'}
          </button>
        ))}
      </div>

      {/* Transaction Records List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 rounded-3xl border border-slate-800">
            No transactions found matching your search.
          </div>
        ) : (
          filtered.map((tx) => {
            const isCredit = tx.amount > 0;
            const isOffline = tx.category === 'offline_peer';

            return (
              <div
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition cursor-pointer flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      isOffline
                        ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                        : isCredit
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : tx.category === 'airtime'
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isOffline ? (
                      <Radio className="w-4 h-4" />
                    ) : isCredit ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : tx.category === 'airtime' ? (
                      <Smartphone className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span className="truncate max-w-[170px] sm:max-w-xs">{tx.title}</span>
                      {isOffline && (
                        <span className="text-[9px] font-mono bg-red-950 text-red-400 px-1.5 py-0.2 rounded border border-red-800">
                          BLE 0-DATA
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {tx.date} · {tx.time} · <span className="font-mono text-slate-500">{tx.reference}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`font-mono font-bold text-xs tabular-nums ${
                      isCredit ? 'text-emerald-400' : 'text-slate-200'
                    }`}
                  >
                    {isCredit ? '+' : ''}₦{Math.abs(tx.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono uppercase">
                    {tx.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transaction Receipt Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-red-400 uppercase font-mono">T-Pay e-Receipt</span>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                ₦{Math.abs(selectedTx.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{selectedTx.title}</div>
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="text-slate-200">{selectedTx.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date & Time:</span>
                <span className="text-slate-200">{selectedTx.date} · {selectedTx.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="text-emerald-400 uppercase">{selectedTx.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Type:</span>
                <span className="text-slate-200">{selectedTx.category}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
