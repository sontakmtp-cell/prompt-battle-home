import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { ProjectPathError, safeProjectPath } from '../src/paths.js';

/**
 * A fresh, hermetic temp directory to act as the project root. The helper is
 * pure (it never touches the filesystem), so the directory only needs to exist
 * to make the assertions realistic.
 */
function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'promptchien-paths-'));
}

function withRoot(fn: (root: string) => void): void {
  const root = makeRoot();
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// legitimate paths must keep working
// ---------------------------------------------------------------------------

test('paths: a normal in-project path is allowed and resolved', () => {
  withRoot((root) => {
    assert.equal(safeProjectPath(root, 'bots/Shield.json'), resolve(root, 'bots/Shield.json'));
    assert.equal(
      safeProjectPath(root, 'reports/balance-m1.md'),
      resolve(root, 'reports/balance-m1.md'),
    );
    assert.equal(
      safeProjectPath(root, 'replays/match-1.json'),
      resolve(root, 'replays/match-1.json'),
    );
  });
});

test('paths: an absolute path that is inside the project is allowed', () => {
  withRoot((root) => {
    const inside = resolve(root, 'bots', 'Shield.json');
    assert.equal(safeProjectPath(root, inside), inside);
  });
});

// ---------------------------------------------------------------------------
// escapes must be rejected on every platform
// ---------------------------------------------------------------------------

test('paths: ../ and ../../ escapes are rejected on every platform', () => {
  withRoot((root) => {
    for (const bad of ['../outside.json', '../../outside.json', '..', '../..']) {
      assert.throws(
        () => safeProjectPath(root, bad),
        ProjectPathError,
        `expected ${bad} to be rejected`,
      );
    }
  });
});

test('paths: an absolute path outside the project is rejected', () => {
  withRoot((root) => {
    const outside = join(tmpdir(), 'promptchien-outside.json');
    assert.throws(() => safeProjectPath(root, outside), ProjectPathError);
  });
});

test('paths: an output path outside the project is rejected (the write path shares the helper)', () => {
  withRoot((root) => {
    assert.throws(() => safeProjectPath(root, '../escaped-report.md'), ProjectPathError);
    assert.throws(
      () => safeProjectPath(root, join(tmpdir(), 'escaped-report.md')),
      ProjectPathError,
    );
  });
});

test('paths: a sibling directory that only shares the name prefix is rejected', () => {
  withRoot((root) => {
    // `<root>-evil` starts with the root string but is NOT inside it: this is
    // exactly the case a naive `abs.startsWith(root)` check gets wrong.
    const sibling = `${root}-evil${sep}x.json`;
    assert.throws(() => safeProjectPath(root, sibling), ProjectPathError);
  });
});

// ---------------------------------------------------------------------------
// symlink / junction escape: the string check passes, the real-path check must not
// ---------------------------------------------------------------------------

test('paths: a symlink/junction inside the root cannot escape it', (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  const link = join(root, 'link');
  try {
    // On win32 a directory junction needs no admin rights; on POSIX use 'dir'.
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    try {
      symlinkSync(outside, link, type);
    } catch (err) {
      t.skip(`environment cannot create a ${type} link: ${(err as Error).message}`);
      return;
    }

    // `link` is a normal child of `root` by string, but really points at
    // `outside`: reading or writing through it must be rejected.
    assert.throws(() => safeProjectPath(root, 'link/x.json'), ProjectPathError);
    assert.throws(() => safeProjectPath(root, join('link', 'nested', 'y.json')), ProjectPathError);
    // the existing target directory itself is just as out of bounds
    assert.throws(() => safeProjectPath(root, 'link'), ProjectPathError);
  } finally {
    // remove the link first so the recursive delete never touches the target
    rmSync(link, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Windows-specific forms
// ---------------------------------------------------------------------------

test('paths: Windows separator / drive-relative / UNC variants are rejected', { skip: process.platform !== 'win32' }, () => {
  withRoot((root) => {
    for (const bad of ['..\\..\\x.json', 'C:foo', 'C:\\Windows\\win.ini', '\\\\server\\share\\x']) {
      assert.throws(
        () => safeProjectPath(root, bad),
        ProjectPathError,
        `expected ${bad} to be rejected`,
      );
    }
    // a backslash form of a legitimate in-project path is still allowed
    assert.equal(safeProjectPath(root, 'bots\\Shield.json'), resolve(root, 'bots\\Shield.json'));
  });
});
