import type { Team } from '@promptchien/contracts';

export type { BotView, FrameView, TileView, TileRuntime } from './replay.js';

/**
 * A tile on the field, addressed the way the UI talks about it: which side and
 * which index inside that bot's definition.
 *
 * It lives in its own module so the arena, the inspector and the editor can all
 * share it without importing each other (which would create a cycle between
 * components).
 */
export interface TileRef {
  team: Team;
  index: number;
}
