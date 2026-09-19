import React from 'react';
import { BotView, TileRef } from '../lab/battleTypes';

interface LeftBotInspectorProps {
  bot: BotView | null;
  side: 'A' | 'B';
  selected: TileRef | null;
  onEditBot: () => void;
}

/**
 * Live bot inspector.
 *
 * Everything here is read off the running replay at the current tick, so the
 * panel answers "what is this body doing right now" rather than "what did it
 * look like when the match started". ky_thuat_my_thuat.md 3.7 asks for exactly
 * that: the viewer should be able to tell a bot's state by eye, before reading
 * any number.
 */
export const LeftBotInspector: React.FC<LeftBotInspectorProps> = ({ bot, side, selected, onEditBot }) => {
  if (!bot) {
    return (
      <div className="w-[260px] rounded-xl border border-dashed border-neutral-200 bg-white/70 p-3">
        <p className="text-[11px] font-mono text-neutral-400">chưa có trận nào</p>
      </div>
    );
  }

  const isA = side === 'A';
  const alive = bot.tiles.filter((t) => t.alive).length;
  const total = bot.tiles.length;
  const damageTaken = bot.tiles.reduce((s, t) => s + t.damageReceived, 0);
  const counts = { hammer: 0, scissor: 0, paper: 0, motor: 0 };
  for (const t of bot.tiles) counts[t.type]++;

  const load = bot.effectiveLoadMilli / 1000;
  const speedPct = bot.speedMultiplierMilli / 10;
  const loadLabel =
    load > 2
      ? 'quá tải — gần như đứng yên'
      : load > 1.5
        ? 'nặng trịch'
        : load > 1
          ? 'bắt đầu ì'
          : load > 0.5
            ? 'vừa đủ sức'
            : 'nhẹ như lông';

  const selectedTile = selected && selected.team === side ? bot.tiles[selected.index] ?? null : null;

  return (
    <div className="w-[260px] bg-white/92 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] pointer-events-auto">
      <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: isA ? '#C0392B' : '#1D4ED8' }} />
          <span className="text-[11px] font-bold font-mono tracking-tight text-neutral-800">
            ĐỘI {side} · {bot.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onEditBot}
          className="text-[10px] font-mono text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded px-1"
          title="Mở trong xưởng"
        >
          sửa
        </button>
      </div>

      <div className="px-3 py-2 flex flex-col gap-2">
        <Row label="Lõi">
          <span className={bot.coreRatioMilli < 300 ? 'text-red-600 font-bold' : 'text-neutral-800 font-semibold'}>
            {bot.coreHp}/{bot.coreMaxHp} ({(bot.coreRatioMilli / 10).toFixed(0)}%)
          </span>
        </Row>
        <div className="w-full h-1.5 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${bot.coreRatioMilli / 10}%`, background: isA ? '#C0392B' : '#1D4ED8' }}
          />
        </div>

        <Row label="Ô còn sống">
          <span className="text-neutral-800 font-semibold">
            {alive} / {total}
          </span>
        </Row>
        <Row label="Chiến đấu">
          <span className={bot.combatAlive === 0 ? 'text-red-600 font-bold' : 'text-neutral-800 font-semibold'}>
            {bot.combatAlive}
          </span>
        </Row>
        <Row label="Motor">
          <span className={bot.motorAlive === 0 ? 'text-red-600 font-bold' : 'text-neutral-800 font-semibold'}>
            {bot.motorAlive}
          </span>
        </Row>

        <div className="h-px bg-neutral-100 my-0.5" />

        <Row label="Hệ số tải">
          <span className={`font-semibold ${load > 2 ? 'text-red-600' : load > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {load.toFixed(2)}
          </span>
        </Row>
        <Row label="Tốc độ">
          <span className="text-neutral-800 font-semibold">{speedPct.toFixed(0)}%</span>
        </Row>
        <p className="text-[10px] font-mono text-neutral-400 -mt-1">{loadLabel}</p>

        <div className="h-px bg-neutral-100 my-0.5" />

        <Row label="Sát thương gây">
          <span className="text-neutral-800 font-semibold">{bot.totalDamageDealt}</span>
        </Row>
        <Row label="Sát thương nhận">
          <span className="text-orange-700 font-semibold">{damageTaken}</span>
        </Row>

        <div className="h-px bg-neutral-100 my-0.5" />

        <div className="grid grid-cols-4 gap-1">
          {(
            [
              ['hammer', 'Búa', '#C0392B'],
              ['scissor', 'Kéo', '#E67E22'],
              ['paper', 'Bao', '#A0821A'],
              ['motor', 'Mot', '#94A3B8'],
            ] as const
          ).map(([key, label, color]) => (
            <div key={key} className="flex flex-col items-center rounded-md border border-neutral-200 py-1">
              <span className="w-2 h-2 rounded-xs mb-0.5" style={{ background: color }} />
              <span className="text-[10px] font-mono text-neutral-500">{label}</span>
              <span className="text-[11px] font-bold font-mono text-neutral-800">{counts[key]}</span>
            </div>
          ))}
        </div>

        {selectedTile && (
          <div className="rounded-lg border border-neutral-900/10 bg-neutral-50 p-2">
            <div className="text-[10px] font-bold font-mono text-neutral-500 mb-1">Ô ĐANG CHỌN #{selectedTile.index}</div>
            <Row label="Loại">
              <span className="capitalize font-semibold">{selectedTile.type}</span>
            </Row>
            <Row label="Hướng">
              <span>{selectedTile.o === 'up' ? 'đỉnh tới' : 'đỉnh lui'}</span>
            </Row>
            <Row label="Máu">
              <span>
                {selectedTile.hp}/{selectedTile.maxHp}
              </span>
            </Row>
            <Row label="Đã nhận">
              <span className="text-orange-700">{selectedTile.damageReceived}</span>
            </Row>
            {!selectedTile.alive && <p className="text-[10px] text-red-600 font-semibold mt-1">đã bị phá</p>}
            {selectedTile.isCore && <p className="text-[10px] text-red-600 font-semibold mt-1">đây là LÕI</p>}
          </div>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between text-[11px] font-mono">
    <span className="text-neutral-400">{label}</span>
    {children}
  </div>
);
