import type {
  BrainCond,
  BrainDefinition,
  BrainMove,
  BrainOperand,
  BrainRotate,
  BrainRule,
  Ruleset,
} from '@promptchien/contracts';

/** Everything the engine publishes to a Brain. Nothing else is readable. */
export type Snapshot = Record<string, number>;

export interface BrainAction {
  move: BrainMove;
  rotate: BrainRotate;
  /** true when the tick ran out of processing budget; the action is dropped */
  violated: boolean;
  steps: number;
}

const HOLD: BrainAction = { move: 'hold', rotate: 'hold', violated: false, steps: 0 };

class BudgetExceeded extends Error {}

interface Ctx {
  snap: Snapshot;
  steps: number;
  max: number;
}

function resolveOperand(o: BrainOperand, vars: Int32Array, slots: Map<string, number>, ctx: Ctx): number {
  ctx.steps++;
  if (ctx.steps > ctx.max) throw new BudgetExceeded();
  if (typeof o === 'number') return o;
  if (o && typeof o === 'object') {
    if ('field' in o) {
      const v = ctx.snap[(o as { field: string }).field];
      return v === undefined ? 0 : v;
    }
    if ('var' in o) {
      const slot = slots.get((o as { var: string }).var);
      return slot === undefined ? 0 : vars[slot]!;
    }
  }
  return 0;
}

function evalCond(c: BrainCond, vars: Int32Array, slots: Map<string, number>, ctx: Ctx): boolean {
  ctx.steps++;
  if (ctx.steps > ctx.max) throw new BudgetExceeded();
  if ('all' in c) {
    for (const sub of c.all) if (!evalCond(sub, vars, slots, ctx)) return false;
    return true;
  }
  if ('any' in c) {
    for (const sub of c.any) if (evalCond(sub, vars, slots, ctx)) return true;
    return false;
  }
  if ('not' in c) return !evalCond(c.not, vars, slots, ctx);
  if ('cmp' in c) {
    const [op, a, b] = c.cmp;
    const av = resolveOperand(a, vars, slots, ctx);
    const bv = resolveOperand(b, vars, slots, ctx);
    switch (op) {
      case '<':
        return av < bv;
      case '<=':
        return av <= bv;
      case '>':
        return av > bv;
      case '>=':
        return av >= bv;
      case '==':
        return av === bv;
      case '!=':
        return av !== bv;
      default:
        return false;
    }
  }
  return false;
}

function collectVars(brain: BrainDefinition): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (o: BrainOperand | undefined) => {
    if (o && typeof o === 'object' && 'var' in o) {
      const n = (o as { var: string }).var;
      if (!seen.has(n)) {
        seen.add(n);
        names.push(n);
      }
    }
  };
  const walk = (c: BrainCond | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('any' in c) c.any.forEach(walk);
    else if ('not' in c) walk(c.not);
    else if ('cmp' in c) {
      add(c.cmp[1]);
      add(c.cmp[2]);
    }
  };
  for (const rule of brain.rules) {
    walk(rule.when);
    if (rule.set) for (const a of rule.set) add(a.value);
  }
  return names;
}

/**
 * A compiled Brain. One instance per bot per match, so the 32 scratch variables
 * live here and are reset with the match.
 */
export class BrainRuntime {
  private readonly rules: BrainRule[];
  private readonly slots = new Map<string, number>();
  private readonly vars = new Int32Array(32);
  private readonly maxSteps: number;

  /** consecutive ticks the brain blew its budget */
  violationRun = 0;
  /** total violating ticks this match */
  violations = 0;
  /** how many rules were scanned last tick, for diagnostics */
  lastRulesScanned = 0;

  constructor(brain: BrainDefinition, rs: Ruleset) {
    this.rules = brain.rules;
    this.maxSteps = rs.BRAIN_MAX_STEPS;
    const names = collectVars(brain);
    for (let i = 0; i < names.length && i < 32; i++) this.slots.set(names[i]!, i);
    this.overflowVars = Math.max(0, names.length - 32);
  }

  readonly overflowVars: number;

  think(snap: Snapshot): BrainAction {
    const ctx: Ctx = { snap, steps: 0, max: this.maxSteps };
    try {
      let scanned = 0;
      for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i]!;
        scanned++;
        let matched = true;
        if (rule.when !== undefined) {
          matched = evalCond(rule.when, this.vars, this.slots, ctx);
        }
        if (!matched) continue;
        this.lastRulesScanned = scanned;
        if (rule.set) {
          for (const a of rule.set) {
            const v = resolveOperand(a.value, this.vars, this.slots, ctx);
            const slot = this.slots.get(a.var);
            if (slot !== undefined) this.vars[slot] = v | 0;
          }
        }
        this.violationRun = 0;
        return {
          move: rule.move ?? 'hold',
          rotate: rule.rotate ?? 'hold',
          violated: false,
          steps: ctx.steps,
        };
      }
      this.lastRulesScanned = scanned;
      this.violationRun = 0;
      return { ...HOLD, steps: ctx.steps };
    } catch (err) {
      if (err instanceof BudgetExceeded) {
        this.violationRun++;
        this.violations++;
        return { move: 'hold', rotate: 'hold', violated: true, steps: ctx.steps };
      }
      throw err;
    }
  }

  reset(): void {
    this.vars.fill(0);
    this.violationRun = 0;
    this.violations = 0;
  }
}
