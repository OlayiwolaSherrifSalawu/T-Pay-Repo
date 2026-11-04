import { useState } from 'react';
import { ArrowLeft, Shield, Radio, Smartphone, Bell, Lock, CheckCircle2 } from 'lucide-react';
import { soundEffects } from '../../utils/audio';

interface SettingsViewProps {
  onBackToDashboard: () => void;
}

export function SettingsView({ onBackToDashboard }: SettingsViewProps) {
  const [meshDiscovery, setMeshDiscovery] = useState(true);
  const [biometrics, setBiometrics] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [defaultAccount, setDefaultAccount] = useState('checking');
  const [dailyLimit, setDailyLimit] = useState(150000);
  const [savedBanner, setSavedBanner] = useState(false);

  const handleToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    soundEffects.playGateSound();
    setter((prev) => !prev);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2000);
  };

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
          Settings & Security
        </h2>
        <span className="text-[11px] font-mono text-emerald-400">
          PROTECTED
        </span>
      </div>

      {savedBanner && (
        <div className="p-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/80 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Preferences updated and saved.</span>
        </div>
      )}

      {/* Mesh & Connectivity Section */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase">
          <Radio className="w-4 h-4 text-red-500" />
          <span>Offline connectivity (sample settings)</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-200">Bluetooth Discovery</div>
            <div className="text-[11px] text-slate-400">Allow nearby T-Pay apps to find and pay you offline</div>
          </div>
          <button
            onClick={() => handleToggle(setMeshDiscovery)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 ${
              meshDiscovery ? 'bg-red-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                meshDiscovery ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Security & Authentication */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase">
          <Shield className="w-4 h-4 text-red-500" />
          <span>Security & Access</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-200">Biometric Authentication</div>
            <div className="text-[11px] text-slate-400">Require Face ID / Fingerprint for transactions</div>
          </div>
          <button
            onClick={() => handleToggle(setBiometrics)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 ${
              biometrics ? 'bg-red-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                biometrics ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
          <div>
            <div className="text-xs font-semibold text-slate-200">Transaction Push Alerts</div>
            <div className="text-[11px] text-slate-400">Real-time notifications on debits and credits</div>
          </div>
          <button
            onClick={() => handleToggle(setNotifications)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 ${
              notifications ? 'bg-red-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                notifications ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Account Preferences */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="text-xs font-bold text-white uppercase">Payment Preferences</div>

        <div>
          <label className="text-[11px] text-slate-400 block mb-1">Default Debit Account</label>
          <select
            value={defaultAccount}
            onChange={(e) => {
              setDefaultAccount(e.target.value);
              setSavedBanner(true);
              setTimeout(() => setSavedBanner(false), 2000);
            }}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-medium"
          >
            <option value="checking">T-Pay Checking (2084739102)</option>
            <option value="savings">T-Pay Savings (0039481920)</option>
            <option value="offline">T-Pay Offline Checking (9102837461)</option>
          </select>
        </div>

        <div className="pt-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Daily Transfer Limit</span>
            <span className="font-mono text-red-400 font-bold tabular-nums">
              ₦{dailyLimit.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min="20000"
            max="500000"
            step="10000"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
            className="w-full accent-red-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>₦20,000</span>
            <span>₦500,000</span>
          </div>
        </div>
      </div>
    </div>
  );
}
