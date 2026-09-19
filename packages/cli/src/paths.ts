import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

/**
 * Thrown when a user-supplied path would escape the project root.
 *
 * A dedicated type lets callers (and tests) distinguish a rejected traversal
 * from an ordinary filesystem error, and lets the CLI fail with a clear message
 * instead of silently reading or writing outside the project.
 */
export class ProjectPathError extends Error {
  /** The user-supplied path that was rejected. */
  readonly userPath: string;
  /** The resolved absolute path that fell outside the root. */
  readonly resolvedPath: string;

  constructor(userPath: string, resolvedPath: string, root: string) {
    super(
      `path "${userPath}" resolves to "${resolvedPath}", which is outside the project root "${root}"`,
    );
    this.name = 'ProjectPathError';
    this.userPath = userPath;
    this.resolvedPath = resolvedPath;
  }
}

/**
 * `realpath` of the root, falling back to the plain resolution when the root
 * does not exist. Never throws: a filesystem hiccup must not turn into a path
 * error.
 */
function realBase(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return resolve(root);
  }
}

/**
 * The real (symlink-resolved) location that `abs` points at.
 *
 * For a path that does not exist yet — the common case when WRITING a new file —
 * `realpathSync` fails, so we walk up to the nearest existing ancestor, resolve
 * THAT, and re-attach the not-yet-existing tail. The tail is kept in order with
 * `unshift` (never an in-place `reverse`), so the re-joined path is correct.
 * Falls back to `abs` if the filesystem root is reached without success.
 */
function realTarget(abs: string): string {
  let probe = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      const realProbe = realpathSync(probe);
      return tail.length === 0 ? realProbe : join(realProbe, ...tail);
    } catch {
      const parent = dirname(probe);
      if (parent === probe) return abs; // reached the filesystem root: give up
      tail.unshift(basename(probe));
      probe = parent;
    }
  }
}

/**
 * True when `target` is not inside `base`. Uses `path.relative` rather than a
 * naive `startsWith`, so a sibling whose name merely shares the base prefix
 * (`.../root` vs `.../root-evil/x`) is correctly seen as an escape.
 */
function relEscapes(base: string, target: string): boolean {
  const rel = relative(base, target);
  if (rel === '') return false; // target === base: contained
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * Resolve a user-supplied path against `root` and verify it stays inside the
 * project. Returns the absolute path on success, throws `ProjectPathError`
 * otherwise.
 *
 * Containment is decided with `path.relative(root, abs)` rather than a naive
 * `abs.startsWith(root)` string test. The string test is a classic bug: it
 * wrongly accepts a sibling directory whose name merely shares the root's prefix
 * (e.g. root `.../prompt-battle-home` and attacker target
 * `.../prompt-battle-home-evil/x.json`, which starts with the root string but is
 * NOT inside it). `path.relative` instead yields `..`-prefixed or absolute output
 * in every escape case:
 *   - `../x`, `../../x`          -> relative is `..` + sep + ... (or `..`)
 *   - an absolute path outside   -> relative is `..`-prefixed
 *   - a path on another drive    -> relative is itself absolute
 *   - a UNC path elsewhere       -> relative is itself absolute
 *
 * A SECOND check then resolves symlinks / junctions on both sides, so a link
 * planted inside the project cannot be used to read or write outside it.
 *
 * The return value is always the plain resolved path (`abs`), never the real
 * path, so behaviour for legitimate in-project paths is unchanged.
 *
 * `root` is a parameter (not captured from `process.cwd()`) so this stays a pure
 * function that tests can exercise against a temporary directory.
 */
export function safeProjectPath(root: string, userPath: string): string {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new ProjectPathError(String(userPath), String(userPath), resolve(root));
  }

  // A drive-relative path (`C:foo`, `C:`) carries a drive letter with no
  // separator after it: its meaning depends on the process-global "current
  // directory on that drive". `path.resolve` can fold it back inside the root
  // (when the root happens to live on the same drive), which would slip past the
  // containment check below, so reject it explicitly on Windows.
  if (process.platform === 'win32' && /^[A-Za-z]:(?![\\/])/.test(userPath)) {
    throw new ProjectPathError(userPath, resolve(resolve(root), userPath), resolve(root));
  }

  const absRoot = resolve(root);
  const abs = resolve(absRoot, userPath);

  // 1. Reject when the plain resolved path climbs out of the root, or when it
  //    is itself absolute (which `path.relative` returns for a different Windows
  //    drive / UNC share that shares no common root).
  if (relEscapes(absRoot, abs)) {
    throw new ProjectPathError(userPath, abs, absRoot);
  }

  // 2. Reject when the real (symlink-resolved) location escapes the root even
  //    though the plain string path looked contained. The REAL path is reported
  //    so the message names where the path actually lands.
  const real = realTarget(abs);
  if (relEscapes(realBase(absRoot), real)) {
    throw new ProjectPathError(userPath, real, absRoot);
  }
  return abs;
}
