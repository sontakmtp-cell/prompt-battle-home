import React from 'react';
import { Sliders, HardDrive } from 'lucide-react';
import { ENGINE_VERSION, RULESET_VERSION } from '@promptchien/contracts';
import { ruleset } from '../lab/lab';

export type Tab = 'Battle' | 'Bots' | 'Lab' | 'Replays';

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  aspectLock: boolean;
  setAspectLock: (lock: boolean) => void;
  persistenceWarning: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  aspectLock,
  setAspectLock,
  persistenceWarning,
}) => {
  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-neutral-200/80 px-6 py-2.5 flex items-center justify-between z-30 select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center text-white shadow-xs">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <polygon points="12 2, 22 21, 2 21" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" fill="none" />
              <polygon points="12 8, 18 19, 6 19" fill="#ea580c" fillOpacity="0.8" />
              <circle cx="12" cy="14" r="2" fill="#ffffff" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-neutral-900 font-sans leading-none">
                PROMPT CHIẾN
              </h1>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-semibold border border-neutral-200">
                M2 · web lab
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 font-medium mt-0.5 tracking-tight">
              Nghĩ ra con thú. Đẽo nó thành hình học. Thả vào đấu trường.
            </p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-neutral-200">
          {(
            [
              ['Battle', 'Trận đấu'],
              ['Bots', 'Xưởng bot'],
              ['Lab', 'Phòng thử'],
              ['Replays', 'Băng ghi'],
            ] as Array<[Tab, string]>
          ).map(([tab, label]) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono">
        <button
          onClick={() => setAspectLock(!aspectLock)}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            aspectLock
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
          }`}
          title="Khoá khung 16:9"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>16:9</span>
        </button>

        {/* Real engine identity, not decoration. */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100/70 border border-neutral-200 text-neutral-500 text-[11px]">
          <span>engine {ENGINE_VERSION}</span>
          <span className="text-neutral-300">|</span>
          <span>ruleset {RULESET_VERSION}</span>
          <span className="text-neutral-300">|</span>
          <span>{ruleset.TICK_RATE} nhịp/giây</span>
        </div>

        {/* M2 is local-first: drafts, versions and the queue live in this browser.
            Accounts, a database and server matchmaking are M3 and are not claimed. */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
            persistenceWarning
              ? 'bg-red-50/80 border-red-200/80 text-red-800'
              : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-800'
          }`}
          title={
            persistenceWarning
              ? `Không ghi được vào bộ nhớ trình duyệt: ${persistenceWarning}`
              : 'Bản nháp, phiên bản và hàng chờ được lưu trong trình duyệt này'
          }
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold tracking-tight uppercase">
            {persistenceWarning ? 'Không lưu được' : 'Lưu cục bộ'}
          </span>
        </div>
      </div>
    </header>
  );
};
