import type {
  BrainCond,
  BrainDefinition,
  BrainOperand,
  BrainRule,
  Ruleset,
  ValidationIssue,
} from '@promptchien/contracts';
import { BRAIN_MOVE_COMMANDS, BRAIN_OPS, BRAIN_ROTATE_COMMANDS } from '@promptchien/contracts';

export const SELF_FIELDS = [
  'x',
  'y',
  'heading',
  'speed',
  'vx',
  'vy',
  'hp',
  'hpRatio',
  'coreHp',
  'coreMaxHp',
  'coreHpRatio',
  'combat',
  'motor',
  'load',
  'stuckTicks',
  'ringOutside',
  'tick',
] as const;

export const ENEMY_FIELDS = [
  'x',
  'y',
  'dx',
  'dy',
  'dist',
  'heading',
  'bearing',
  'coreHpRatio',
  'combat',
  'motor',
  'load',
] as const;

const SELF_SET = new Set<string>(SELF_FIELDS);
const ENEMY_SET = new Set<string>(ENEMY_FIELDS);

export interface BrainStats {
  nodes: number;
  depth: number;
  vars: number;
}

function condDepth(c: BrainCond): number {
  if ('all' in c) {
    let d = 0;
    for (const sub of c.all) d = Math.max(d, condDepth(sub));
    return 1 + d;
  }
  if ('any' in c) {
    let d = 0;
    for (const sub of c.any) d = Math.max(d, condDepth(sub));
    return 1 + d;
  }
  if ('not' in c) return 1 + condDepth(c.not);
  return 1;
}

function condNodes(c: BrainCond): number {
  if ('all' in c) return 1 + c.all.reduce((a, s) => a + condNodes(s), 0);
  if ('any' in c) return 1 + c.any.reduce((a, s) => a + condNodes(s), 0);
  if ('not' in c) return 1 + condNodes(c.not);
  return 1;
}

function operandField(o: BrainOperand): string | null {
  if (typeof o === 'object' && o !== null && 'field' in o) return (o as { field: string }).field;
  return null;
}

function operandVar(o: BrainOperand): string | null {
  if (typeof o === 'object' && o !== null && 'var' in o) return (o as { var: string }).var;
  return null;
}

/** Check one condition tree, collecting issues; returns node/var usage. */
function walkCond(
  c: BrainCond,
  path: string,
  issues: ValidationIssue[],
  vars: Set<string>,
): number {
  const push = (code: string, message: string, at?: string) =>
    issues.push({ code, severity: 'error', message, path: at });

  if ('all' in c || 'any' in c) {
    const key = 'all' in c ? 'all' : 'any';
    const arr = (c as { all?: BrainCond[]; any?: BrainCond[] })[key]!;
    if (!Array.isArray(arr) || arr.length === 0) {
      push('BRAIN_EMPTY_GROUP', `"${key}" needs at least one sub-condition`);
      return 1;
    }
    let n = 1;
    for (let i = 0; i < arr.length; i++) n += walkCond(arr[i]!, `${path}.${key}[${i}]`, issues, vars);
    return n;
  }
  if ('not' in c) return 1 + walkCond(c.not, `${path}.not`, issues, vars);
  if ('cmp' in c) {
    const cmp = c.cmp;
    if (!Array.isArray(cmp) || cmp.length !== 3) {
      push('BRAIN_BAD_CMP', 'cmp must be [op, a, b]');
      return 1;
    }
    if (!BRAIN_OPS.includes(cmp[0] as never)) {
      push('BRAIN_BAD_OP', `unknown comparison operator "${String(cmp[0])}"`);
    }
    for (const operand of [cmp[1], cmp[2]] as BrainOperand[]) {
      const f = operandField(operand);
      if (f !== null) {
        if (f.startsWith('self.')) {
          if (!SELF_SET.has(f.slice(5))) push('BRAIN_BAD_FIELD', `unknown self field "${f}"`, path);
        } else if (f.startsWith('enemy.')) {
          if (!ENEMY_SET.has(f.slice(6))) push('BRAIN_BAD_FIELD', `unknown enemy field "${f}"`, path);
        } else {
          push('BRAIN_BAD_FIELD', `field "${f}" must start with self. or enemy.`, path);
        }
      }
      const v = operandVar(operand);
      if (v !== null) vars.add(v);
    }
    return 1;
  }
  push('BRAIN_BAD_COND', `unknown condition node: ${JSON.stringify(c)}`, path);
  return 1;
}

/**
 * Static validation of a Brain against the published budget
 * (256 nodes, depth 16, 32 integer variables).
 */
export function validateBrain(
  brain: BrainDefinition,
  rs: Ruleset,
): { issues: ValidationIssue[]; stats: BrainStats } {
  const issues: ValidationIssue[] = [];
  const vars = new Set<string>();
  let nodes = 0;
  let depth = 0;

  if (typeof brain !== 'object' || brain === null) {
    issues.push({ code: 'BRAIN_NOT_OBJECT', severity: 'error', message: 'brain must be an object' });
    return { issues, stats: { nodes: 0, depth: 0, vars: 0 } };
  }
  if (brain.version !== 1) {
    issues.push({
      code: 'BRAIN_BAD_VERSION',
      severity: 'error',
      message: `brain.version must be 1, got ${String(brain.version)}`,
      path: 'brain.version',
    });
  }
  if (!Array.isArray(brain.rules) || brain.rules.length === 0) {
    issues.push({
      code: 'BRAIN_NO_RULES',
      severity: 'error',
      message: 'brain.rules must be a non-empty array',
      path: 'brain.rules',
    });
    return { issues, stats: { nodes: 0, depth: 0, vars: 0 } };
  }

  for (let i = 0; i < brain.rules.length; i++) {
    const rule = brain.rules[i] as BrainRule;
    const path = `brain.rules[${i}]`;
    nodes += 1;
    if (typeof rule !== 'object' || rule === null) {
      issues.push({ code: 'BRAIN_BAD_RULE', severity: 'error', message: 'rule must be an object', path });
      continue;
    }
    if (rule.when !== undefined) {
      nodes += walkCond(rule.when, `${path}.when`, issues, vars);
      depth = Math.max(depth, condDepth(rule.when));
    }
    if (rule.move !== undefined && !BRAIN_MOVE_COMMANDS.includes(rule.move)) {
      issues.push({
        code: 'BRAIN_BAD_MOVE',
        severity: 'error',
        message: `unknown move command "${String(rule.move)}"`,
        path,
      });
    }
    if (rule.rotate !== undefined && !BRAIN_ROTATE_COMMANDS.includes(rule.rotate)) {
      issues.push({
        code: 'BRAIN_BAD_ROTATE',
        severity: 'error',
        message: `unknown rotate command "${String(rule.rotate)}"`,
        path,
      });
    }
    if (rule.set !== undefined) {
      if (!Array.isArray(rule.set)) {
        issues.push({ code: 'BRAIN_BAD_SET', severity: 'error', message: 'set must be an array', path });
      } else {
        for (let k = 0; k < rule.set.length; k++) {
          const assign = rule.set[k]!;
          nodes += 1;
          if (!assign || typeof assign.var !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(assign.var)) {
            issues.push({
              code: 'BRAIN_BAD_VAR',
              severity: 'error',
              message: 'variable names must match ^[A-Za-z_][A-Za-z0-9_]{0,15}$',
              path: `${path}.set[${k}]`,
            });
          } else {
            vars.add(assign.var);
          }
          const f = operandField(assign?.value as BrainOperand);
          if (f !== null) {
            if (f.startsWith('self.')) {
              if (!SELF_SET.has(f.slice(5))) issues.push({ code: 'BRAIN_BAD_FIELD', severity: 'error', message: `unknown self field "${f}"`, path });
            } else if (f.startsWith('enemy.')) {
              if (!ENEMY_SET.has(f.slice(6))) issues.push({ code: 'BRAIN_BAD_FIELD', severity: 'error', message: `unknown enemy field "${f}"`, path });
            } else {
              issues.push({ code: 'BRAIN_BAD_FIELD', severity: 'error', message: `field "${f}" must start with self. or enemy.`, path });
            }
          }
          const v = operandVar(assign?.value as BrainOperand);
          if (v !== null) vars.add(v);
        }
      }
    }
    if (rule.move === undefined && rule.rotate === undefined) {
      issues.push({
        code: 'BRAIN_NO_ACTION',
        severity: 'warning',
        message: 'rule has no move or rotate action; it can only assign variables',
        path,
      });
    }
  }

  if (nodes > rs.BRAIN_MAX_NODES) {
    issues.push({
      code: 'BRAIN_TOO_MANY_NODES',
      severity: 'error',
      message: `brain has ${nodes} nodes, limit is ${rs.BRAIN_MAX_NODES}`,
      path: 'brain',
    });
  }
  if (depth > rs.BRAIN_MAX_DEPTH) {
    issues.push({
      code: 'BRAIN_TOO_DEEP',
      severity: 'error',
      message: `brain condition depth is ${depth}, limit is ${rs.BRAIN_MAX_DEPTH}`,
      path: 'brain',
    });
  }
  if (vars.size > rs.BRAIN_MAX_VARS) {
    issues.push({
      code: 'BRAIN_TOO_MANY_VARS',
      severity: 'error',
      message: `brain uses ${vars.size} variables, limit is ${rs.BRAIN_MAX_VARS}`,
      path: 'brain',
    });
  }

  return { issues, stats: { nodes, depth, vars: vars.size } };
}
