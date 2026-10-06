import React from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { SafetyItemKey, SafetyState } from '../types/lab';

interface SafetyPanelProps {
  safety: SafetyState;
  onToggleSafety: (item: SafetyItemKey) => void;
}

const SAFETY_ITEMS: {
  key: SafetyItemKey;
  title: string;
  confirmedText: string;
  pendingText: string;
  renderSvg: (active: boolean) => React.ReactNode;
}[] = [
  {
    key: 'goggles',
    title: 'Պաշտպանիչ ակնոց',
    confirmedText: 'Ակնոցը հագած է',
    pendingText: 'Սեղմե՛ք՝ հագնելու համար',
    renderSvg: (active) => (
      <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
        <path
          d="M6 20C6 16.6863 8.68629 14 12 14H36C39.3137 14 42 16.6863 42 20V25C42 29.4183 38.4183 33 34 33H29.5C27.5 33 26 31 24 31C22 31 20.5 33 18.5 33H14C9.58172 33 6 29.4183 6 25V20Z"
          stroke={active ? '#10B981' : '#94A3B8'}
          strokeWidth="2.6"
          fill={active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.08)'}
        />
        <path
          d="M11 21H20M28 21H37"
          stroke={active ? '#34D399' : '#64748B'}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M6 21H3M42 21H45"
          stroke={active ? '#10B981' : '#94A3B8'}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: 'gloves',
    title: 'Լաբորատոր ձեռնոց',
    confirmedText: 'Ձեռնոցները հագած են',
    pendingText: 'Սեղմե՛ք՝ հագնելու համար',
    renderSvg: (active) => (
      <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
        <path
          d="M15 39V23C15 21.3431 13.6569 20 12 20C10.3431 20 9 21.3431 9 23V29C9 35.6274 14.3726 41 21 41H28C33.5228 41 38 36.5228 38 31V15C38 13.3431 36.6569 12 35 12C33.3431 12 32 13.3431 32 15V22M32 15V10C32 8.34315 30.6569 7 29 7C27.3431 7 26 8.34315 26 10V21M26 10C26 8.34315 24.6569 7 23 7C21.3431 7 20 8.34315 20 10V22M20 13C20 11.3431 18.6569 10 17 10C15.3431 10 14 11.3431 14 13V24"
          stroke={active ? '#10B981' : '#94A3B8'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.08)'}
        />
      </svg>
    ),
  },
  {
    key: 'coat',
    title: 'Լաբորատոր խալաթ',
    confirmedText: 'Խալաթը հագած է',
    pendingText: 'Սեղմե՛ք՝ հագնելու համար',
    renderSvg: (active) => (
      <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
        <path
          d="M17 8L10 12L6 26L12 28L14 19V40H34V19L36 28L42 26L38 12L31 8L24 17L17 8Z"
          stroke={active ? '#10B981' : '#94A3B8'}
          strokeWidth="2.5"
          strokeLinejoin="round"
          fill={active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.08)'}
        />
        <path
          d="M24 17V40"
          stroke={active ? '#34D399' : '#64748B'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export const SafetyPanel: React.FC<SafetyPanelProps> = ({
  safety,
  onToggleSafety,
}) => {
  const completedCount =
    (safety.goggles ? 1 : 0) + (safety.gloves ? 1 : 0) + (safety.coat ? 1 : 0);
  const allReady = completedCount === 3;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          {allReady ? (
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          )}
          <h2 className="text-sm font-bold text-white">
            1. Անվտանգության կանոններ
          </h2>
        </div>
        <span className="font-mono text-xs text-slate-400">
          {completedCount}/3 ակտիվ
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-slate-300">
        Սեղմե՛ք յուրաքանչյուր պատկերակի վրա՝ անվտանգության պարագաները հագնելու և
        լաբորատոր սեղանի սարքավորումները բացելու համար․
      </p>

      <div className="space-y-2.5">
        {SAFETY_ITEMS.map((item) => {
          const isActive = safety[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggleSafety(item.key)}
              className={`group flex w-full items-center justify-between rounded-lg border p-2.5 text-left transition-all duration-150 ${
                isActive
                  ? 'border-emerald-500/60 bg-emerald-950/35 text-emerald-100 shadow-sm'
                  : 'border-slate-700/80 bg-slate-800/60 text-slate-200 hover:border-sky-500/50 hover:bg-slate-800'
              }`}
            >
              {/* Left side: Icon */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-900 text-slate-400 group-hover:border-slate-500'
                  }`}
                >
                  {item.renderSvg(isActive)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {item.title}
                  </div>
                  <div
                    className={`mt-0.5 text-xs font-medium ${
                      isActive ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {isActive ? item.confirmedText : item.pendingText}
                  </div>
                </div>
              </div>

              {/* Right side: Confirmation status */}
              <div className="flex items-center gap-1.5 pl-2">
                {isActive ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Հաստատված</span>
                  </span>
                ) : (
                  <span className="text-xs text-amber-400/90">Պարտադիր</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
