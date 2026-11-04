import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Send,
  ArrowRight,
  Radio,
  Cpu,
  Globe,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { BankAccount, SupportedLanguage } from '../types/banking';
import { soundEffects } from '../utils/audio';
import { container } from '../../core/container';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  onExecuteVoiceTransfer: (fromType: string, toName: string, amount: number) => void;
  onOpenNearbyScan: () => void;
  onNavigateToTracker?: (caseTab?: 'merchant' | 'user' | 'driver') => void;
  onOpenMarketVault?: () => void;
  onInterpret: (
    transcript: string,
    language: string,
    inventory: unknown[]
  ) => Promise<{
    allowed: boolean;
    reason?: string;
    proposal: { action: string; amountNgn: number | null; item: string | null; payeeName: string | null; reply: string };
  }>;
  onConfirmPayment: (draft: { amountNgn: number; memo: string }) => void;
  initialPrompt?: string;
}

export function VoiceAssistantModal({
  isOpen,
  onClose,
  accounts,
  onExecuteVoiceTransfer,
  onOpenNearbyScan,
  onNavigateToTracker,
  onOpenMarketVault,
  onInterpret,
  onConfirmPayment,
  initialPrompt,
}: VoiceAssistantModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>('pidgin');
  const [isLocalSLM, setIsLocalSLM] = useState(!navigator.onLine);
  const [isSpeakingOutLoud, setIsSpeakingOutLoud] = useState(true);
  const [activeActionDetails, setActiveActionDetails] = useState<{
    category: 'merchant' | 'budget' | 'driver' | 'transfer' | 'general';
    summary: string;
    actionLabel?: string;
    onExecute?: () => void;
  } | null>(null);

  // Audio readout function to close the literacy gap
  const speakAloud = (text: string) => {
    if (!isSpeakingOutLoud) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const msg = "Live browser microphone speech recognition is not supported in this browser. Please tap any sample command below!";
      setAiResponse(msg);
      speakAloud(msg);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language === 'en' ? 'en-NG' : 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('Listening to your voice...');
        soundEffects.playGateSound();
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalTranscript = event.results[i][0].transcript.trim();
            setIsListening(false);
            processCommand(finalTranscript);
            return;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (interim) {
          setTranscript(interim);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[SpeechRecognition] error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          const errMsg = "Microphone access blocked. Please allow mic permissions in your browser or tap a preset prompt below.";
          setAiResponse(errMsg);
          speakAloud(errMsg);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('[SpeechRecognition] failed to initialize:', err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  };

  useEffect(() => {
    if (!isOpen) {
      setTranscript('');
      setAiResponse(null);
      setActiveActionDetails(null);
      setIsListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    if (initialPrompt) {
      processCommand(initialPrompt);
    } else {
      // Prompt user in selected dialect
      const welcomeMap: Record<SupportedLanguage, string> = {
        pidgin: "T-Pay Hybrid AI dey ready. Wetin you wan make I run for you?",
        en: "T-Pay Hybrid AI is listening. Speak a command or pick a demo action.",
        yoruba: "E kaabo si T-Pay AI. Bawo ni mo se le ran yin lowo?",
        igbo: "Nnoo na T-Pay AI. Kedu ihe m ga-emere gi taa?",
        hausa: "Barka da zuwa T-Pay AI. Me kake so in yi maka?",
      };
      setAiResponse(welcomeMap[language]);
      speakAloud(welcomeMap[language]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
    soundEffects.playGateSound();
    const confirmations: Record<SupportedLanguage, string> = {
      pidgin: "Dialect set to Nigerian Pidgin. Talk wetin you want.",
      en: "Language set to English. Ready for your voice command.",
      yoruba: "A ti yi ede pada si Yoruba.",
      igbo: "Asusu buzi Igbo.",
      hausa: "An canza harshe zuwa Hausa.",
    };
    setAiResponse(confirmations[lang]);
    speakAloud(confirmations[lang]);
  };

  /**
   * The model only proposes. A payment still goes through the vault check on the
   * server and then the user's own confirmation before anything is signed.
   */
  const interpretWithModel = async (commandText: string) => {
    try {
      const inventory = (await container.inventoryRepository.findAll()).map((item) => ({
        name: item.name,
        unitPriceNgn: item.unitPrice.amount,
      }));
      const { allowed, reason, proposal } = await onInterpret(commandText, language, inventory);
      const reply = allowed ? proposal.reply : reason || proposal.reply;
      setAiResponse(reply);
      speakAloud(reply);

      if (!allowed) return;
      if (proposal.action === 'PAY' && proposal.amountNgn) {
        const amountNgn = proposal.amountNgn;
        setActiveActionDetails({
          category: 'transfer',
          summary: `Pay ₦${amountNgn.toLocaleString('en-NG')}${proposal.payeeName ? ` to ${proposal.payeeName}` : ''}`,
          actionLabel: 'Review and sign',
          onExecute: () => {
            onClose();
            onConfirmPayment({ amountNgn, memo: proposal.payeeName ?? '' });
          },
        });
      } else if (proposal.action !== 'UNKNOWN') {
        runRules(commandText);
      }
    } catch (error) {
      console.warn('[VoiceAssistant] Falling back to rules:', error);
      runRules(commandText);
    }
  };

  const processCommand = (commandText: string) => {
    setTranscript(commandText);
    setIsListening(false);
    soundEffects.playGateSound();

    if (!isLocalSLM && navigator.onLine) {
      void interpretWithModel(commandText);
      return;
    }
    runRules(commandText);
  };

  // Rule-based matching: the path that works with no network.
  const runRules = (commandText: string) => {
    container.processSpokenCommandUseCase
      .execute({
        transcript: commandText,
        language,
        executionMode: 'offline_slm',
      })
      .catch((e) => console.warn('[VoiceAssistant] Domain execution notice:', e));

    const lower = commandText.toLowerCase();

    // 1. Merchant: "Collect 1000 for coke" or "Collect one thousand for coke"
    if (lower.includes('coke') && (lower.includes('collect') || lower.includes('1000') || lower.includes('thousand') || lower.includes('1k'))) {
      const resp =
        language === 'pidgin'
          ? "I don confirm ₦1,000 for Coke! Coke na ₦500 for one bottle, so na 2 bottles we don sell. Inventory minus 2 bottles sharp sharp."
          : "Collected ₦1,000 for Coke. At ₦500 per bottle, that is exactly 2 bottles sold. Inventory deducted by 2 bottles and logged in spreadsheet.";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'merchant',
        summary: 'Sold 2 bottles of Coke (₦1,000). Deducted 2 from inventory.',
        actionLabel: 'View Merchant Inventory Sheet',
        onExecute: () => {
          onClose();
          onNavigateToTracker?.('merchant');
        },
      });
      return;
    }

    // 2. Merchant: Voice Inventory Setup ("Coke, 42 packs, 500 naira for 1; Maltina, 56 packs, 600 for 1")
    if (lower.includes('pack') || lower.includes('maltina') || lower.includes('inventory')) {
      const resp =
        language === 'pidgin'
          ? "Oya! I don record everything: Coke 42 packs at ₦500, Maltina 56 packs at ₦600. I don compile the full spreadsheet for you."
          : "Inventory recorded: 42 packs of Coke (₦500 each) and 56 packs of Maltina (₦600 each). Live spreadsheet has been compiled.";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'merchant',
        summary: 'Compiled spreadsheet: 42 Coke + 56 Maltina.',
        actionLabel: 'Open Inventory Spreadsheet',
        onExecute: () => {
          onClose();
          onNavigateToTracker?.('merchant');
        },
      });
      return;
    }

    // 3. Regular User: "Send 2k for spag" or "Send two thousand for food"
    if (lower.includes('spag') || lower.includes('spaghetti') || lower.includes('food')) {
      const resp =
        language === 'pidgin'
          ? "Sharp! I don deduct ₦2,000 from your Food budget, and I put note 'for spag'. Your food budget balance remain ₦34,000."
          : "Deducted ₦2,000 from Food Budget with label 'for spag'. Food budget remaining is ₦34,000.";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'budget',
        summary: 'Deducted ₦2,000 from Food budget (tagged "for spag").',
        actionLabel: 'View Monthly Budget Tracker',
        onExecute: () => {
          onClose();
          onNavigateToTracker?.('user');
        },
      });
      return;
    }

    // 4. Ambiguity Case: "Send 5k for sneakers" or ambiguous upkeep
    if (lower.includes('sneaker') || lower.includes('shoe') || lower.includes('5k')) {
      const resp =
        language === 'pidgin'
          ? "Wait o! This ₦5,000 for sneakers, shey make I put am under Food, Transport, or Upkeep?"
          : "Ambiguity check: You mentioned 5k for sneakers. Does this fall under Food, Transport, or Upkeep?";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'budget',
        summary: 'Clarification needed: Choose category for ₦5,000.',
        actionLabel: 'Resolve in Budget Tracker',
        onExecute: () => {
          onClose();
          onNavigateToTracker?.('user');
        },
      });
      return;
    }

    // 5. Bus Driver: "Collect money from everybody"
    if (lower.includes('everybody') || lower.includes('korope') || lower.includes('passenger') || lower.includes('bus')) {
      const resp =
        language === 'pidgin'
          ? "Morufu Transport active! I dey scan all passengers for this 7-seater Korope via Bluetooth now. 5 passengers don pay, remaining 2 seats."
          : "Morufu Transport: Sweeping 7-seater Korope via Bluetooth BLE. 5 of 7 passengers paid, 2 remaining.";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'driver',
        summary: 'Morufu Transport: 5 of 7 seats paid. Sweeping remaining 2.',
        actionLabel: 'Open Korope Bus Terminal',
        onExecute: () => {
          onClose();
          onNavigateToTracker?.('driver');
        },
      });
      return;
    }

    // 6. Market Vault / Time-Locked Escrow: "Lock 10k for market vault" or "Pre-auth budget vault"
    if (lower.includes('market') || lower.includes('vault') || lower.includes('lock 10k') || lower.includes('escrow')) {
      const resp =
        language === 'pidgin'
          ? "I dey prepare Time-Locked Market Vault for you! ₦10,000 will be pre-locked on PayPal with HMAC-SHA256 crypto token. Zero double-spend fraud offline."
          : "Pre-authorizing Time-Locked Market Vault on PayPal for ₦10,000. Balance is pre-locked on PayPal servers for offline spending.";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'transfer',
        summary: 'Market Vault: ₦10,000 PayPal Pre-Auth ready.',
        actionLabel: 'Open Market Vault',
        onExecute: () => {
          onClose();
          onOpenMarketVault?.();
        },
      });
      return;
    }

    // 7. Daily Reconciliation & Stock Audit: "Review daily sales" or "Stock audit"
    if (lower.includes('audit') || lower.includes('reconciliation') || lower.includes('daily sales') || lower.includes('eod') || lower.includes('review my')) {
      const resp =
        language === 'pidgin'
          ? "Oya Mama Nkechi! I don open End-of-Day reconciliation audit. You have 40 Coke and 56 Maltina in stock, with live cash sales logged."
          : "Opening End-of-Day Reconciliation & Physical Stock Audit. Current inventory and cash sales are verified.";
      setAiResponse(resp);
      speakAloud(resp);
      setActiveActionDetails({
        category: 'merchant',
        summary: 'End-of-Day Stock Audit & Cash Sales Reconciliation ready.',
        actionLabel: 'Open Daily Stock Audit',
        onExecute: () => {
          onClose();
          onNavigateToTracker?.('merchant');
        },
      });
      return;
    }

    // 8. Nearby / Bluetooth Offline Pay
    if (lower.includes('nearby') || lower.includes('bluetooth') || lower.includes('offline')) {
      const resp =
        language === 'pidgin'
          ? "I dey open your Bluetooth Offline Scanner right now. Zero data required!"
          : "Opening Bluetooth & Wi-Fi Direct peer scanner for zero-data payment.";
      setAiResponse(resp);
      speakAloud(resp);
      setTimeout(() => {
        onClose();
        onOpenNearbyScan();
      }, 1400);
      return;
    }

    // 9. Balance Check
    if (lower.includes('balance') || lower.includes('how much') || lower.includes('wetin dey')) {
      const offline = accounts.find((a) => a.type === 'offline_checking')?.availableBalance || 0;
      const resp =
        language === 'pidgin'
          ? `Your T-Pay Offline balance na ₦${offline.toLocaleString()}. Total money for all accounts na ₦529,500.`
          : `Your T-Pay Offline Checking balance is ₦${offline.toLocaleString()}. Total portfolio is ₦529,500.`;
      setAiResponse(resp);
      speakAloud(resp);
      return;
    }

    // Default Fallback
    const fallbackResp =
      language === 'pidgin'
        ? `I hear you say "${commandText}". I don log this request inside your T-Pay AI journal.`
        : `Understood "${commandText}". Command processed by ${isLocalSLM ? 'on-device rules' : 'the online model'}.`;
    setAiResponse(fallbackResp);
    speakAloud(fallbackResp);
  };

  const sampleVoicePrompts = [
    { label: 'Collect 1k for coke', full: 'Collect one thousand for coke', tag: 'Case 1: Merchant' },
    { label: 'Review daily sales audit', full: 'Review daily sales audit', tag: 'EOD Audit' },
    { label: 'Lock 10k for market vault', full: 'Lock 10k for market vault', tag: 'Market Vault' },
    { label: 'Send 2k for spag', full: 'Send two thousand for spag', tag: 'Case 2: Budget' },
    { label: 'Collect from everybody', full: 'Collect money from everybody', tag: 'Case 3: Driver' },
    { label: 'Wetin dey my account?', full: 'Wetin dey my offline account?', tag: 'Pidgin Balance' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-rose-600 flex items-center justify-center shadow-md shadow-red-700/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white tracking-tight">T-Pay Hybrid Voice AI</h3>
                <span className="text-[9px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.2 rounded font-mono font-bold">
                  {isLocalSLM ? 'OFFLINE RULES' : 'ONLINE MODEL'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Zero-literacy voice commerce & auto-spreadsheets</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsSpeakingOutLoud(!isSpeakingOutLoud)}
              className={`p-1.5 rounded-lg border transition ${
                isSpeakingOutLoud
                  ? 'bg-slate-800 text-emerald-400 border-slate-700'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
              title="Toggle Text-To-Speech read aloud"
            >
              {isSpeakingOutLoud ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dialect and Engine Control Bar */}
        <div className="py-2.5 flex items-center justify-between border-b border-slate-800/80 text-[11px] shrink-0">
          <div className="flex items-center gap-1 text-slate-400">
            <Globe className="w-3.5 h-3.5 text-red-500" />
            <span>Language:</span>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white font-semibold focus:outline-none focus:border-red-500 text-xs"
            >
              <option value="pidgin">🇳🇬 Pidgin English</option>
              <option value="en">🇬🇧 English</option>
              <option value="yoruba">🇳🇬 Yoruba</option>
              <option value="igbo">🇳🇬 Igbo</option>
              <option value="hausa">🇳🇬 Hausa</option>
            </select>
          </div>

          <button
            onClick={() => setIsLocalSLM(!isLocalSLM)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 font-mono transition"
            title="Switch between on-device rules and the online model"
          >
            <Cpu className="w-3 h-3 text-red-400" />
            <span>{isLocalSLM ? 'On-device rules' : 'Online model'}</span>
          </button>
        </div>

        {/* Assistant Content Body */}
        <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
          {/* Animated Waveform Visualizer */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center space-y-3">
            <button
              onClick={() => (isListening ? stopListening() : startListening())}
              type="button"
              className="relative flex items-center justify-center w-20 h-20 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer transition-transform active:scale-95 group"
              title={isListening ? 'Click to stop listening' : 'Click to speak hands-free'}
            >
              <div
                className={`absolute inset-0 rounded-full bg-red-600/30 animate-ping ${
                  isListening ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-red-600 to-rose-600 flex items-center justify-center shadow-lg shadow-red-700/40 group-hover:scale-105 transition-all">
                {isListening ? (
                  <MicOff className="w-8 h-8 text-white animate-pulse" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </div>
            </button>

            {/* Audio Wave Bars */}
            <div className="flex items-center gap-1 h-6">
              {[40, 75, 50, 90, 60, 85, 45, 95, 70, 50].map((h, i) => (
                <div
                  key={i}
                  style={{ height: isListening ? `${h}%` : '20%' }}
                  className="w-1 bg-red-500 rounded-full transition-all duration-200"
                />
              ))}
            </div>

            <div className="text-xs text-slate-400">
              {isListening ? (
                <span className="text-red-400 font-semibold animate-pulse">
                  Listening in {language.toUpperCase()}... Speak now or tap to stop
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  Tap microphone to speak hands-free or pick a prompt below
                </span>
              )}
            </div>
          </div>

          {/* AI Response Card (Spoken Aloud) */}
          {aiResponse && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-red-950/40 border border-red-800/80 text-white space-y-2"
            >
              <div className="flex items-center justify-between text-[11px] text-red-400">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Voice Response (Spoken Out Loud)</span>
                </div>
                <button
                  onClick={() => speakAloud(aiResponse)}
                  className="text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Replay</span>
                </button>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                "{aiResponse}"
              </p>

              {activeActionDetails && (
                <div className="mt-3 pt-2.5 border-t border-red-900/60 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-emerald-300 font-semibold">
                    ✓ {activeActionDetails.summary}
                  </span>
                  {activeActionDetails.actionLabel && (
                    <button
                      onClick={activeActionDetails.onExecute}
                      className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] flex items-center gap-1 transition"
                    >
                      <span>{activeActionDetails.actionLabel}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* One-Tap Sample Commands from the User Vision Document */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 px-1">
              Test Voice Scenarios (From Vision Document)
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {sampleVoicePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => processCommand(p.full)}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 hover:border-red-500/50 flex items-center justify-between text-left transition group"
                >
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-red-400 transition">
                      "{p.label}"
                    </div>
                    <div className="text-[10px] text-slate-500">{p.full}</div>
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {p.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
          <span className="text-[10px] text-slate-500">
            Rules work offline. Payments always need your confirmation.
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
