import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Layers, Zap, Play, RotateCcw, ChevronRight, ChevronLeft, ArrowRight, ShieldCheck, Cpu, Database } from 'lucide-react';
import { HACKATHON_DECK } from '../data/mockData';

interface JudgePitchHubProps {
  onTriggerDemoScenario: (scenario: 'merchant_sale' | 'user_budget' | 'driver_bus' | 'vault_escrow') => void;
  onResetDemoData: () => void;
  onClose?: () => void;
}

export function JudgePitchHub({ onTriggerDemoScenario, onResetDemoData, onClose }: JudgePitchHubProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'pitch' | 'architecture' | 'scenarios' | 'strategy'>('pitch');

  const currentSlide = HACKATHON_DECK[currentSlideIndex];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl animate-fade-in select-none">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-800">
                PAYPAL HACKATHON
              </span>
              <span className="text-xs text-slate-400">T-Pay Judge Showcase</span>
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">
              Pitch Deck & System Architecture
            </h2>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('pitch')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'pitch'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pitch Deck
          </button>
          <button
            onClick={() => setActiveTab('scenarios')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'scenarios'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3 Demo Cases
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'architecture'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Architecture
          </button>
          <button
            onClick={() => setActiveTab('strategy')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'strategy'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            B2B vs Ecosystem
          </button>
        </div>
      </div>

      {/* Tab 1: Pitch Deck Carousel */}
      {activeTab === 'pitch' && (
        <div className="space-y-6">
          {/* Slide Navigation controls */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-mono text-red-400 font-semibold">
                Slide {currentSlideIndex + 1} of {HACKATHON_DECK.length}
              </span>
              <span>·</span>
              <span className="text-slate-300 font-medium">{currentSlide.badge}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentSlideIndex === 0}
                onClick={() => setCurrentSlideIndex((prev) => prev - 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentSlideIndex === HACKATHON_DECK.length - 1}
                onClick={() => setCurrentSlideIndex((prev) => prev + 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Current Slide Display */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="bg-slate-950 rounded-2xl p-6 border border-slate-800/80 space-y-5"
            >
              <div>
                <h3 className="text-xl font-extrabold text-white tracking-tight">
                  {currentSlide.title}
                </h3>
                <p className="text-sm text-red-300 mt-1 font-medium leading-relaxed">
                  {currentSlide.headline}
                </p>
              </div>

              {/* Slide bullet points */}
              <div className="space-y-2.5">
                {currentSlide.content.map((point, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 font-mono text-[10px]">
                      0{idx + 1}
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>

              {/* Key Metrics Strip */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-800/80">
                {currentSlide.metrics.map((metric, idx) => (
                  <div key={idx} className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                      {metric.value}
                    </div>
                    <div className="text-xs font-semibold text-slate-200">{metric.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{metric.detail}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Step Pill Selectors */}
          <div className="flex gap-2">
            {HACKATHON_DECK.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setCurrentSlideIndex(idx)}
                className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-medium transition text-left truncate ${
                  currentSlideIndex === idx
                    ? 'bg-red-600/30 text-red-300 border border-red-500/50'
                    : 'bg-slate-950 text-slate-500 border border-slate-800 hover:text-slate-300'
                }`}
              >
                0{idx + 1}. {slide.badge.split(':')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Live Demo Scenarios for Judges */}
      {activeTab === 'scenarios' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Click any interactive scenario below to trigger live DDD use-case executions and voice updates on the app in real time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                  01
                </span>
                <h4 className="text-sm font-semibold text-white">Merchant: "Collect 1k for Coke"</h4>
              </div>
              <p className="text-xs text-slate-400">
                Price-to-quantity derivation: ₦1,000 / ₦500 unit price deducts 2 Coke bottles. Compiles inventory sheet and speaks aloud.
              </p>
              <button
                onClick={() => onTriggerDemoScenario('merchant_sale')}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs shadow-md shadow-red-600/20 transition active:scale-98"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Merchant Scenario</span>
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                  02
                </span>
                <h4 className="text-sm font-semibold text-white">Regular User: "Send 2k for Spag"</h4>
              </div>
              <p className="text-xs text-slate-400">
                Colloquial natural language parsing maps "spag" to Food budget. Deducts ₦2,000 and logs note with ambiguity resolution.
              </p>
              <button
                onClick={() => onTriggerDemoScenario('user_budget')}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition active:scale-98"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute User Budget Scenario</span>
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                  03
                </span>
                <h4 className="text-sm font-semibold text-white">Bus Driver: "Collect from Everybody"</h4>
              </div>
              <p className="text-xs text-slate-400">
                7-seat Korope mini-bus manifest. Fills the seat manifest from sample passengers and informs driver Morufu of paid seats.
              </p>
              <button
                onClick={() => onTriggerDemoScenario('driver_bus')}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 transition active:scale-98"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Korope Sweep</span>
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                  04
                </span>
                <h4 className="text-sm font-semibold text-white">The Big Gun: Budget-Locked Vault</h4>
              </div>
              <p className="text-xs text-slate-400">
                Pre-funds ₦10,000 in Market Vault with cryptographic lock on PayPal balance. Zero-data spend & auto-melt unspent refund.
              </p>
              <button
                onClick={() => onTriggerDemoScenario('vault_escrow')}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-md shadow-sky-600/20 transition active:scale-98"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Open offline payments</span>
              </button>
            </div>
          </div>

          {/* Live Dual-Window P2P Mesh Testing Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/40 via-slate-950 to-blue-950/40 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Try it as two devices</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                This window is device A. Open device B beside it, then pay from A to B with QR codes or a copied code. Each has its own signing key and ledger.
              </p>
            </div>
            <a
              href="/?device=b"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs whitespace-nowrap transition flex items-center gap-1.5 shrink-0"
            >
              <span>Open device B ↗</span>
            </a>
          </div>
        </div>
      )}

      {/* Tab 3: System Architecture */}
      {activeTab === 'architecture' && (
        <div className="space-y-4">
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-red-500" />
              <span>Dual-App Local Trust Architecture (The Big Gun)</span>
            </h4>

            {/* Architecture Node Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="font-semibold text-sky-400 mb-1">1. Online Pre-Auth Lock</div>
                <p className="text-[11px] text-slate-400">
                  The payer approves a real PayPal authorisation. The backend issues a signed certificate carrying the ceiling, rate and 24-hour expiry.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="font-semibold text-red-400 mb-1">2. Zero-Data Offline Handshake</div>
                <p className="text-[11px] text-slate-400">
                  The payer signs an ECDSA P-256 voucher and passes it by QR code. The payee verifies it with no network. Reconciliation detects any over-spend and blocks the vault.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="font-semibold text-emerald-400 mb-1">3. Opportunistic PayPal Capture</div>
                <p className="text-[11px] text-slate-400">
                  Whichever device reconnects first submits the voucher. The backend captures once against the authorisation, and both devices see the same capture ID.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="font-semibold text-amber-400 mb-1">4. Automatic Fund Melt</div>
                <p className="text-[11px] text-slate-400">
                  Melting voids the remaining authorisation at PayPal. It is refused while any signed voucher has not settled.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Strategic Roadmap (Directly from PDF Pages 4-6) */}
      {activeTab === 'strategy' && (
        <div className="space-y-4">
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>B2B Enterprise API vs Closed-Loop Wallet (The Verdict)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-bold text-sky-400 text-sm">Option 1: B2B API Standard (Selling to Moniepoint/OPay)</div>
                <ul className="space-y-1.5 text-slate-300 text-[11px]">
                  <li>• <strong>The Problem:</strong> Fragmented POS hardware. Merchants carry multiple bank terminals.</li>
                  <li>• <strong>The API Value:</strong> Open offline infrastructure standard (like NIBSS/Interswitch for offline tokens).</li>
                  <li>• <strong>Tradeoff:</strong> Hard pitch to tier-1 banks initially; lower branding power.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-red-900/60 space-y-2">
                <div className="font-bold text-red-400 text-sm">Option 2: Closed-Loop Ecosystem (T-Pay Exclusive)</div>
                <ul className="space-y-1.5 text-slate-300 text-[11px]">
                  <li>• <strong>The Benefit:</strong> Total control over ledger, 0 fraud risk, 100% data capture & transaction fees.</li>
                  <li>• <strong>Hackathon Strategy:</strong> Exclusive feature: "T-Pay users gain exclusive access to the Secure Offline Budget Vault."</li>
                  <li>• <strong>Future Pivot:</strong> Prove tech in the wild first, then license API standard to big commercial banks.</li>
                </ul>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                <strong>Winning Hackathon Formula:</strong> Launch as a Closed-Loop Ecosystem with PayPal as primary processor to win the hackathon; expand to an open B2B offline clearinghouse protocol API.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer Demo Reset Button */}
      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span>Presenter Controls</span>
        <button
          onClick={onResetDemoData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo Data</span>
        </button>
      </div>
    </div>
  );
}

