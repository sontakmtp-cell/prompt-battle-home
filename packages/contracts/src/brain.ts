/**
 * The Brain command set (PLAN.md section 2, "Brain theo bo lenh game").
 *
 * A Brain is a declarative program: state -> condition -> action. Every tick the
 * rules are scanned in order and the first matching rule contributes at most one
 * movement action and one rotation action. There is no "attack" command: a bot
 * fights by driving its own body into the enemy (gameplay.md 3.6).
 */

/** Movement along the bot's own axes. */
export type BrainMove =
  | 'forward'
  | 'backward'
  | 'hold'
  | 'strafeLeft'
  | 'strafeRight';

/**
 * Rotation request. `left` / `right` turn at the bot's current maximum angular
 * speed; `toEnemy` steers the nose onto the enemy; `orbitLeft` / `orbitRight`
 * hold the enemy at roughly 45 degrees off the nose so the bot spirals in.
 */
export type BrainRotate =
  | 'hold'
  | 'left'
  | 'right'
  | 'toEnemy'
  | 'toEnemyCore'
  | 'awayFromEnemy'
  | 'orbitLeft'
  | 'orbitRight';

export type BrainOp = '<' | '<=' | '>' | '>=' | '==' | '!=';

export type BrainOperand = number | { field: string } | { var: string };

export type BrainCond =
  | { all: BrainCond[] }
  | { any: BrainCond[] }
  | { not: BrainCond }
  | { cmp: [BrainOp, BrainOperand, BrainOperand] };

export interface BrainAssign {
  var: string;
  value: BrainOperand;
}

export interface BrainRule {
  /** Absent means "always". */
  when?: BrainCond;
  /** Integer assignments to the 32 scratch variables, applied before the actions. */
  set?: BrainAssign[];
  move?: BrainMove;
  rotate?: BrainRotate;
}

export interface BrainDefinition {
  version: number;
  rules: BrainRule[];
}

/** Every field a Brain may read. Nothing else is published (PLAN.md section 2). */
export const BRAIN_SELF_FIELDS = [
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

export const BRAIN_ENEMY_FIELDS = [
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

export const BRAIN_MOVE_COMMANDS: readonly BrainMove[] = [
  'forward',
  'backward',
  'hold',
  'strafeLeft',
  'strafeRight',
];

export const BRAIN_ROTATE_COMMANDS: readonly BrainRotate[] = [
  'hold',
  'left',
  'right',
  'toEnemy',
  'toEnemyCore',
  'awayFromEnemy',
  'orbitLeft',
  'orbitRight',
];

export const BRAIN_OPS: readonly BrainOp[] = ['<', '<=', '>', '>=', '==', '!='];
