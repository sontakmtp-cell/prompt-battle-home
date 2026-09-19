import type {
  BotDefinition,
  BotPackage,
  MatchOutcome,
  ValidationReport,
} from '@promptchien/contracts';

/**
 * The M2 local store.
 *
 * PLAN.md M2 is deliberately local-first: drafts, versions and the match queue
 * live in `localStorage`. Accounts, a database, real auth and server-side
 * matchmaking are M3 and are explicitly *not* claimed here.
 *
 * WHY MATCHES STORE DEFINITIONS AND A SEED, NOT A REPLAY FILE
 * -----------------------------------------------------------
 * gameplay.md 6.1 promises a replay that "plays back 100% exactly", and
 * `spec_demo.md` 18 makes the engine deterministic: same two packages + same
 * seed = same match, bit for bit. A full replay is roughly 1.5 MB of JSON, so
 * keeping a handful of them would blow the ~5 MB `localStorage` quota in three
 * matches.
 *
 * Storing the two definitions plus the seed instead costs a couple of kilobytes
 * and reproduces the identical match on demand - which is also exactly what the
 * CLI's `verify` command does. The engine's determinism is what makes the
 * storage cheap, so this leans on a property the project already guarantees
 * rather than inventing a new one.
 */

export interface LockedVersion {
  /** `${definitionHash}:r${revision}` - stable key for the queue and match records */
  key: string;
  packageId: string;
  definitionHash: string;
  definition: BotDefinition;
  revision: number;
  lockedLoadMilli: number;
  engineVersion: string;
  rulesetVersion: string;
  /** the report that authorised this lock; invalidated the moment the bot changes */
  report: ValidationReport;
  ordinal: number;
}

export interface BotDraft {
  id: string;
  name: string;
  definition: BotDefinition;
  /** next revision ordinal for this lineage (gameplay.md 4.3, "nuoi tien hoa") */
  nextRevision: number;
  /** keys of every version ever locked from this draft, oldest first */
  versionKeys: string[];
  ordinal: number;
}

export interface QueueEntry {
  id: string;
  ordinal: number;
  versionKey: string;
  botName: string;
  definitionHash: string;
  status: 'waiting' | 'matched';
  matchId: string | null;
}

export interface StoredMatch {
  matchId: string;
  ordinal: number;
  seed: number;
  a: { name: string; hash: string; definition: BotDefinition; versionKey: string };
  b: { name: string; hash: string; definition: BotDefinition; versionKey: string };
  outcome: MatchOutcome;
  replayHash: string;
}

export interface LabState {
  /** bumped whenever the persisted shape changes, so old blobs are dropped cleanly */
  schemaVersion: number;
  /** monotonic counter used for every ordering decision; never wall-clock */
  nextOrdinal: number;
  drafts: Record<string, BotDraft>;
  versions: Record<string, LockedVersion>;
  queue: QueueEntry[];
  matches: StoredMatch[];
  /** draft currently open in the editor */
  activeDraftId: string | null;
}

const STORAGE_KEY = 'promptchien.lab.v1';
const SCHEMA_VERSION = 1;

function emptyState(): LabState {
  return {
    schemaVersion: SCHEMA_VERSION,
    nextOrdinal: 1,
    drafts: {},
    versions: {},
    queue: [],
    matches: [],
    activeDraftId: null,
  };
}

function isUsable(value: unknown): value is LabState {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<LabState>;
  return (
    s.schemaVersion === SCHEMA_VERSION &&
    typeof s.nextOrdinal === 'number' &&
    typeof s.drafts === 'object' &&
    s.drafts !== null &&
    typeof s.versions === 'object' &&
    s.versions !== null &&
    Array.isArray(s.queue) &&
    Array.isArray(s.matches)
  );
}

/**
 * In-memory state + subscribers. `localStorage` is written through on every
 * mutation; if it is unavailable (private mode, quota) the lab still works for
 * the session and simply forgets on reload.
 */
class LabStore {
  private state: LabState;
  private listeners = new Set<() => void>();
  /** set when persistence failed, so the UI can be honest about it */
  public persistenceError: string | null = null;

  constructor() {
    this.state = this.read();
  }

  private read(): LabState {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed: unknown = JSON.parse(raw);
      return isUsable(parsed) ? parsed : emptyState();
    } catch {
      return emptyState();
    }
  }

  private write(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.persistenceError = null;
    } catch (e) {
      this.persistenceError = e instanceof Error ? e.message : String(e);
    }
  }

  private commit(next: LabState): void {
    this.state = next;
    this.write();
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): LabState => this.state;

  /** Allocate the next ordering ordinal. Deterministic, never wall-clock. */
  private takeOrdinal(): number {
    const n = this.state.nextOrdinal;
    this.state.nextOrdinal = n + 1;
    return n;
  }

  // ---- drafts ------------------------------------------------------------

  createDraft(definition: BotDefinition): BotDraft {
    const ordinal = this.takeOrdinal();
    const draft: BotDraft = {
      id: `d${ordinal}`,
      name: definition.name,
      definition,
      nextRevision: 1,
      versionKeys: [],
      ordinal,
    };
    this.commit({
      ...this.state,
      drafts: { ...this.state.drafts, [draft.id]: draft },
      activeDraftId: draft.id,
    });
    return draft;
  }

  /**
   * Replace the draft's definition. Deliberately does NOT touch locked versions:
   * gameplay.md 4.3 says editing a bot can only ever create a new revision, so a
   * locked package stays frozen and the validation report attached to it stays
   * valid.
   */
  updateDraft(draftId: string, definition: BotDefinition): void {
    const draft = this.state.drafts[draftId];
    if (!draft) return;
    this.commit({
      ...this.state,
      drafts: {
        ...this.state.drafts,
        [draftId]: { ...draft, definition, name: definition.name },
      },
    });
  }

  renameDraft(draftId: string, name: string): void {
    const draft = this.state.drafts[draftId];
    if (!draft) return;
    this.commit({
      ...this.state,
      drafts: {
        ...this.state.drafts,
        [draftId]: { ...draft, name, definition: { ...draft.definition, name } },
      },
    });
  }

  deleteDraft(draftId: string): void {
    const drafts = { ...this.state.drafts };
    delete drafts[draftId];
    this.commit({
      ...this.state,
      drafts,
      activeDraftId: this.state.activeDraftId === draftId ? null : this.state.activeDraftId,
    });
  }

  setActiveDraft(draftId: string | null): void {
    this.commit({ ...this.state, activeDraftId: draftId });
  }

  // ---- versions ----------------------------------------------------------

  /** Freeze a validated draft into an immutable revision (gameplay.md 4.3). */
  lockVersion(draftId: string, pkg: BotPackage, report: ValidationReport): LockedVersion {
    const draft = this.state.drafts[draftId];
    const revision = draft ? draft.nextRevision : 1;
    const key = `${pkg.definitionHash}:r${revision}`;
    const version: LockedVersion = {
      key,
      packageId: pkg.packageId,
      definitionHash: pkg.definitionHash,
      definition: pkg.definition,
      revision,
      lockedLoadMilli: pkg.lockedLoadMilli,
      engineVersion: pkg.engineVersion,
      rulesetVersion: pkg.rulesetVersion,
      report,
      ordinal: this.takeOrdinal(),
    };
    const drafts = { ...this.state.drafts };
    if (draft) {
      drafts[draftId] = {
        ...draft,
        nextRevision: revision + 1,
        versionKeys: [...draft.versionKeys, key],
      };
    }
    this.commit({
      ...this.state,
      drafts,
      versions: { ...this.state.versions, [key]: version },
    });
    return version;
  }

  getVersion(key: string): LockedVersion | undefined {
    return this.state.versions[key];
  }

  // ---- FIFO queue (PLAN.md section 3) ------------------------------------

  /**
   * Push a locked version onto the FIFO queue. A queue entry always points at a
   * frozen package, never at a draft, so a bot cannot be edited while it waits.
   */
  enqueue(version: LockedVersion): QueueEntry {
    const entry: QueueEntry = {
      id: `q${this.takeOrdinal()}`,
      ordinal: this.takeOrdinal(),
      versionKey: version.key,
      botName: version.definition.name,
      definitionHash: version.definitionHash,
      status: 'waiting',
      matchId: null,
    };
    this.commit({ ...this.state, queue: [...this.state.queue, entry] });
    return entry;
  }

  cancelQueueEntry(entryId: string): void {
    this.commit({
      ...this.state,
      queue: this.state.queue.filter((e) => e.id !== entryId),
    });
  }

  /**
   * Take the two oldest waiting entries. Matchmaking pairs two *different*
   * players (PLAN.md section 3); with a single local user that reduces to "two
   * different bots", which is what the guard below enforces.
   */
  takeNextPair(): [QueueEntry, QueueEntry] | null {
    const waiting = this.state.queue
      .filter((e) => e.status === 'waiting')
      .sort((a, b) => a.ordinal - b.ordinal);
    if (waiting.length < 2) return null;
    for (let i = 0; i < waiting.length; i++) {
      for (let j = i + 1; j < waiting.length; j++) {
        const a = waiting[i]!;
        const b = waiting[j]!;
        if (a.definitionHash !== b.definitionHash) return [a, b];
      }
    }
    return null;
  }

  markMatched(entryIds: string[], matchId: string): void {
    const ids = new Set(entryIds);
    this.commit({
      ...this.state,
      queue: this.state.queue.map((e) =>
        ids.has(e.id) ? { ...e, status: 'matched' as const, matchId } : e,
      ),
    });
  }

  // ---- matches -----------------------------------------------------------

  recordMatch(match: StoredMatch): void {
    this.commit({ ...this.state, matches: [...this.state.matches, match] });
  }

  clearAll(): void {
    this.commit(emptyState());
  }
}

export const labStore = new LabStore();
