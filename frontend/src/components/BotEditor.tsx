import React, { useCallback, useMemo, useState } from 'react';
import type { BotDefinition, BrainMove, BrainRotate, TriCell, TriType } from '@promptchien/contracts';
import {
  BRAIN_ENEMY_FIELDS,
  BRAIN_MOVE_COMMANDS,
  BRAIN_OPS,
  BRAIN_ROTATE_COMMANDS,
  BRAIN_SELF_FIELDS,
  BOT_SCHEMA_VERSION,
} from '@promptchien/contracts';
import { coreIndexOf, gridToTriangles } from '@promptchien/core';
import { ruleset } from '../lab/lab';

/**
 * The bot builder.
 *
 * PLAN.md M2's gate is that someone who does not write code can build, validate,
 * test, edit and submit a bot. So the editor works in the units the design docs
 * use, not in engine units:
 *
 *  - one lattice cell is one rhombus = the (down, up) triangle pair that tiles
 *    together (see `gridToTriangles`), so every click produces an edge-connected
 *    body by construction and the player never has to think about connectivity;
 *  - the budget is shown in triangles (60) because that is the number
 *    gameplay.md 3.2 quotes, while the grid counts rhombi;
 *  - load factor and speed come straight from the engine's own validator, so what
 *    the editor shows is what the match will do.
 */

const GRID_COLS = 12;
const GRID_ROWS = 12;

type Tool = TriType | 'core' | 'erase';

const TOOL_LABEL: Record<Tool, string> = {
  hammer: 'Búa',
  scissor: 'Kéo',
  paper: 'Bao',
  motor: 'Motor',
  core: 'Lõi',
  erase: 'Xoá',
};

const TOOL_KEY: Record<TriType, string> = {
  hammer: 'H',
  scissor: 'S',
  paper: 'P',
  motor: 'M',
};

const TOOL_COLOR: Record<Tool, string> = {
  hammer: '#C0392B',
  scissor: '#E67E22',
  paper: '#A0821A',
  motor: '#94A3B8',
  core: '#1D4ED8',
  erase: '#CBD5E1',
};

/** Definition -> character grid, the inverse of `gridToTriangles`. */
function toGrid(def: BotDefinition): { grid: string[][]; coreR: number; coreJ: number } {
  const grid: string[][] = Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => '.'));
  let coreR = -1;
  let coreJ = -1;
  const coreTile = def.triangles[def.coreIndex];
  for (const t of def.triangles) {
    if (t.r < 0 || t.r >= GRID_ROWS || t.j < 0 || t.j >= GRID_COLS) continue;
    grid[t.r]![t.j] = TOOL_KEY[t.type];
    if (coreTile && t.r === coreTile.r && t.j === coreTile.j) {
      coreR = t.r;
      coreJ = t.j;
    }
  }
  return { grid, coreR, coreJ };
}

/** Character grid -> definition, reusing the engine's own builder. */
function fromGrid(
  grid: string[][],
  coreR: number,
  coreJ: number,
  name: string,
  brain: BotDefinition['brain'],
): BotDefinition {
  const rows = grid.map((row) => row.join(''));
  let triangles: TriCell[];
  try {
    triangles = gridToTriangles(rows);
  } catch {
    triangles = [];
  }
  if (triangles.length === 0) {
    return { schemaVersion: BOT_SCHEMA_VERSION, name, triangles: [], coreIndex: 0, brain };
  }
  let coreIndex = 0;
  try {
    coreIndex = coreIndexOf(rows, coreR, coreJ);
  } catch {
    coreIndex = 0;
  }
  return { schemaVersion: BOT_SCHEMA_VERSION, name, triangles, coreIndex, brain };
}

export interface BotEditorProps {
  definition: BotDefinition;
  onChange: (def: BotDefinition) => void;
}

export const BotEditor: React.FC<BotEditorProps> = ({ definition, onChange }) => {
  const [tool, setTool] = useState<Tool>('hammer');
  const [gridState, setGridState] = useState(() => toGrid(definition));
  const [tab, setTab] = useState<'body' | 'brain'>('body');

  // The editor keeps its own grid because a definition alone cannot express
  // "empty cell" or "no Core yet"; the definition is derived from it.
  const { grid, coreR, coreJ } = gridState;

  const apply = useCallback(
    (next: { grid: string[][]; coreR: number; coreJ: number }) => {
      setGridState(next);
      onChange(fromGrid(next.grid, next.coreR, next.coreJ, definition.name, definition.brain));
    },
    [definition.name, definition.brain, onChange],
  );

  // Re-sync when the definition is swapped from outside (e.g. loading a sample).
  const incoming = useMemo(() => toGrid(definition), [definition]);
  React.useEffect(() => {
    setGridState((prev) => {
      const prevDef = fromGrid(prev.grid, prev.coreR, prev.coreJ, definition.name, definition.brain);
      if (
        prevDef.triangles.length === definition.triangles.length &&
        prevDef.coreIndex === definition.coreIndex
      ) {
        // Same body, only the brain changed - keep the local grid untouched.
        return prev;
      }
      return incoming;
    });
  }, [definition, incoming]);

  const clickCell = (r: number, j: number) => {
    const nextGrid = grid.map((row) => row.slice());
    let nextCoreR = coreR;
    let nextCoreJ = coreJ;

    if (tool === 'erase') {
      nextGrid[r]![j] = '.';
      if (coreR === r && coreJ === j) {
        nextCoreR = -1;
        nextCoreJ = -1;
      }
    } else if (tool === 'core') {
      // can_bang.md 6.6: the Core may not sit on a motor.
      if (nextGrid[r]![j] === 'M') return;
      if (nextGrid[r]![j] === '.') nextGrid[r]![j] = 'H';
      nextCoreR = r;
      nextCoreJ = j;
    } else {
      nextGrid[r]![j] = TOOL_KEY[tool];
    }
    apply({ grid: nextGrid, coreR: nextCoreR, coreJ: nextCoreJ });
  };

  const clearAll = () => apply({ grid: emptyGrid(), coreR: -1, coreJ: -1 });

  const triangles = definition.triangles.length;
  const overBudget = triangles > ruleset.MAX_TRIANGLES;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {(Object.keys(TOOL_LABEL) as Tool[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTool(t)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
              tool === t
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <span className="inline-block w-2 h-2 rounded-xs mr-1.5 align-middle" style={{ background: TOOL_COLOR[t] }} />
            {TOOL_LABEL[t]}
          </button>
        ))}
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-semibold border border-neutral-200 text-neutral-500 hover:border-red-300 hover:text-red-600 transition-colors"
        >
          Xoá hết
        </button>
      </div>

      <div className="flex gap-1 text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setTab('body')}
          className={`px-3 py-1 rounded-t-md border-b-2 ${
            tab === 'body' ? 'border-neutral-900 text-neutral-900 font-bold' : 'border-transparent text-neutral-400'
          }`}
        >
          Thân
        </button>
        <button
          type="button"
          onClick={() => setTab('brain')}
          className={`px-3 py-1 rounded-t-md border-b-2 ${
            tab === 'brain' ? 'border-neutral-900 text-neutral-900 font-bold' : 'border-transparent text-neutral-400'
          }`}
        >
          Não ({definition.brain.rules.length} luật)
        </button>
      </div>

      {tab === 'body' ? (
        <LatticeGrid grid={grid} coreR={coreR} coreJ={coreJ} onClick={clickCell} />
      ) : (
        <BrainEditor definition={definition} onChange={(brain) => onChange({ ...definition, brain })} />
      )}

      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className={overBudget ? 'text-red-600 font-bold' : 'text-neutral-500'}>
          {triangles} / {ruleset.MAX_TRIANGLES} tam giác
          {overBudget && ' — vượt ngân sách'}
        </span>
        <span className="text-neutral-400">
          {triangles / 2} ô · tối đa {ruleset.MAX_TRIANGLES / 2}
        </span>
      </div>
    </div>
  );
};

function emptyGrid(): string[][] {
  return Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => '.'));
}

// ---------------------------------------------------------------------------
// The lattice
// ---------------------------------------------------------------------------

const CELL = 26;
const ROW_H = 22.517;

const LatticeGrid: React.FC<{
  grid: string[][];
  coreR: number;
  coreJ: number;
  onClick: (r: number, j: number) => void;
}> = ({ grid, coreR, coreJ, onClick }) => {
  const width = (GRID_COLS + 1) * CELL;
  const height = GRID_ROWS * ROW_H + ROW_H;

  /** Rhombus outline for cell (r, j): two triangles sharing an edge. */
  const rhombus = (r: number, j: number): string => {
    const off = (r & 1) * (CELL / 2);
    const xL = j * CELL + off;
    const xR = xL + CELL;
    const yT = r * ROW_H;
    const yB = yT + ROW_H;
    const xM = xL + CELL / 2;
    return `${xL},${yT} ${xR},${yT} ${xR},${yB} ${xM},${yB} ${xL},${yB}`;
  };

  const downTri = (r: number, j: number): string => {
    const off = (r & 1) * (CELL / 2);
    const xL = j * CELL + off;
    const yT = r * ROW_H;
    const yB = yT + ROW_H;
    return `${xL},${yT} ${xL + CELL},${yT} ${xL + CELL / 2},${yB}`;
  };

  const upTri = (r: number, j: number): string => {
    const off = (r & 1) * (CELL / 2);
    const xL = j * CELL + off;
    const yT = r * ROW_H;
    const yB = yT + ROW_H;
    return `${xL + CELL / 2},${yB} ${xL + CELL + CELL / 2},${yB} ${xL + CELL},${yT}`;
  };

  const fillFor = (ch: string): string => {
    switch (ch) {
      case 'H':
        return '#C0392B';
      case 'S':
        return '#E67E22';
      case 'P':
        return '#A0821A';
      case 'M':
        return '#E8EBEF';
      default:
        return 'none';
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 340 }}>
        {grid.map((row, r) =>
          row.map((ch, j) => {
            const isCore = r === coreR && j === coreJ;
            const filled = ch !== '.';
            return (
              <g key={`${r}-${j}`}>
                {filled && (
                  <>
                    <polygon
                      points={downTri(r, j)}
                      fill={fillFor(ch)}
                      stroke={ch === 'M' ? '#94A3B8' : '#1F2937'}
                      strokeWidth="0.9"
                      strokeDasharray={ch === 'M' ? '3 2' : undefined}
                    />
                    <polygon
                      points={upTri(r, j)}
                      fill={fillFor(ch)}
                      stroke={ch === 'M' ? '#94A3B8' : '#1F2937'}
                      strokeWidth="0.9"
                      strokeDasharray={ch === 'M' ? '3 2' : undefined}
                    />
                  </>
                )}
                <polygon
                  points={rhombus(r, j)}
                  className="lattice-cell-hit"
                  stroke="#E2E8F0"
                  strokeWidth="0.5"
                  onClick={() => onClick(r, j)}
                >
                  {/* One template string, not an array of text nodes: React cannot
                      turn a multi-node <title> into the single string the SVG
                      tooltip needs, and warns about it at render time. */}
                  <title>{`ô [${r}, ${j}] · ${filled ? ch : 'trống'}`}</title>
                </polygon>
                {isCore && (
                  <circle
                    cx={j * CELL + (r & 1) * (CELL / 2) + CELL / 2}
                    cy={r * ROW_H + ROW_H * 0.55}
                    r={6}
                    fill="none"
                    stroke="#1D4ED8"
                    strokeWidth="2"
                  />
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Brain
// ---------------------------------------------------------------------------

const BrainEditor: React.FC<{
  definition: BotDefinition;
  onChange: (brain: BotDefinition['brain']) => void;
}> = ({ definition, onChange }) => {
  const rules = definition.brain.rules;
  const fields = [
    ...BRAIN_SELF_FIELDS.map((f) => `self.${f}`),
    ...BRAIN_ENEMY_FIELDS.map((f) => `enemy.${f}`),
  ];

  const patch = (index: number, next: Partial<(typeof rules)[number]>) => {
    const copy = rules.map((r, i) => (i === index ? { ...r, ...next } : r));
    onChange({ ...definition.brain, rules: copy });
  };

  const setCond = (index: number, field: string, op: string, value: number) => {
    patch(index, { when: { cmp: [op as '<', { field }, value] } });
  };

  return (
    <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
      {rules.map((rule, i) => {
        const cond = rule.when && 'cmp' in rule.when ? rule.when.cmp : null;
        const field = cond && typeof cond[1] === 'object' && 'field' in cond[1] ? cond[1].field : '';
        const op = cond ? cond[0] : '>';
        const value = cond && typeof cond[2] === 'number' ? cond[2] : 0;
        return (
          <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-mono text-neutral-400 w-8">#{i + 1}</span>
              <select
                value={field}
                onChange={(e) => setCond(i, e.target.value, op, value)}
                className="flex-1 text-[11px] font-mono rounded border border-neutral-200 bg-white px-1 py-0.5"
              >
                <option value="">luôn đúng</option>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                value={op}
                onChange={(e) => setCond(i, field, e.target.value, value)}
                disabled={!field}
                className="text-[11px] font-mono rounded border border-neutral-200 bg-white px-1 py-0.5 disabled:opacity-40"
              >
                {BRAIN_OPS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={value}
                disabled={!field}
                onChange={(e) => setCond(i, field, op, Number(e.target.value))}
                className="w-20 text-[11px] font-mono rounded border border-neutral-200 bg-white px-1 py-0.5 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => onChange({ ...definition.brain, rules: rules.filter((_, k) => k !== i) })}
                className="text-[11px] text-neutral-400 hover:text-red-600 px-1"
                title="Xoá luật"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-mono text-neutral-500 w-8">đi</label>
              <select
                value={rule.move ?? 'forward'}
                onChange={(e) => patch(i, { move: e.target.value as BrainMove })}
                className="flex-1 text-[11px] font-mono rounded border border-neutral-200 bg-white px-1 py-0.5"
              >
                {BRAIN_MOVE_COMMANDS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="text-[10px] font-mono text-neutral-500 w-10">xoay</label>
              <select
                value={rule.rotate ?? 'hold'}
                onChange={(e) => patch(i, { rotate: e.target.value as BrainRotate })}
                className="flex-1 text-[11px] font-mono rounded border border-neutral-200 bg-white px-1 py-0.5"
              >
                {BRAIN_ROTATE_COMMANDS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          onChange({ ...definition.brain, rules: [...rules, { move: 'forward', rotate: 'toEnemy' }] })
        }
        className="text-[11px] font-semibold text-neutral-600 border border-dashed border-neutral-300 rounded-lg py-1.5 hover:border-neutral-500 hover:text-neutral-900"
      >
        + Thêm luật
      </button>
      <p className="text-[10px] text-neutral-400 leading-relaxed">
        Mỗi nhịp, engine duyệt luật từ trên xuống và luật đầu tiên đúng sẽ quyết định. Không có lệnh “đánh” —
        bot chiến đấu bằng cách lao chính thân mình vào địch.
      </p>
    </div>
  );
};

export { toGrid as definitionToGrid, fromGrid as gridToDefinition };
