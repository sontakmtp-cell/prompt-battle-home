/**
 * Renders the real components to markup and inspects the result.
 *
 * This is the closest thing to "looking at it" that can run without a browser.
 * `renderToStaticMarkup` executes the whole component tree - the projection, the
 * batching, the Core markers, the ring, the sparks, the fracture lines - so it
 * catches the class of bug that type checking cannot: a crash on a particular
 * tick, a `NaN` that silently makes an SVG attribute invalid, a colour that was
 * typed by hand instead of read from the palette, or batching that quietly
 * regressed back to one element per tile.
 *
 * It cannot judge whether the result looks GOOD. That still needs eyes.
 *
 * Run: npx tsx frontend/test/render.test.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BotDefinition, TriType } from '@promptchien/contracts';
import { SAMPLE_BOTS } from '@promptchien/core';
import { BattleArena } from '../src/components/BattleArena';
import { TopHud } from '../src/components/TopHud';
import { LeftBotInspector } from '../src/components/LeftBotInspector';
import { RightMatchEvents } from '../src/components/RightMatchEvents';
import { BottomReplayBar } from '../src/components/BottomReplayBar';
import { BotEditor } from '../src/components/BotEditor';
import { ReplayView } from '../src/lab/replay';
import { runAdHoc, ruleset } from '../src/lab/lab';
import { heatColor, paletteColorSpace } from '../src/lab/palette';
import { settingsFor } from '../src/lab/quality';

let failures = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

const [spear, , flanker, spinner, glassCannon] = SAMPLE_BOTS;
const quality = settingsFor('high', 1);

console.log('render check (server-side markup)');

function makeView(a: BotDefinition, b: BotDefinition, seed: number): ReplayView {
  const o = runAdHoc(a, b, seed);
  return new ReplayView(o.replay, o.match.a.definition, o.match.b.definition, ruleset);
}

function arenaMarkup(view: ReplayView, tickFloat: number, damageMap = false): string {
  return renderToStaticMarkup(
    <BattleArena
      view={view}
      frame={view.frameAt(tickFloat)}
      tickFloat={tickFloat}
      isPlaying={false}
      damageMapActive={damageMap}
      gridActive
      vectorsActive={false}
      selected={null}
      onSelect={() => undefined}
      quality={quality}
    />,
  );
}

// ---------------------------------------------------------------------------
// 1. it renders at all, on every interesting tick
// ---------------------------------------------------------------------------
const view = makeView(spear!, flanker!, 7);
{
  const ticks: number[] = [0, 1, 2, Math.floor(view.totalTicks / 2), view.totalTicks - 1];
  for (const cp of view.replay.checkpoints) ticks.push(cp.tick);
  for (const e of view.replay.events) {
    if (e.kind === 'hit' || e.kind === 'destroy' || e.kind === 'detach') ticks.push(Math.max(0, e.tick - 1));
  }
  const unique = [...new Set(ticks)].filter((t) => t >= 0 && t < view.totalTicks);

  let thrown: string | null = null;
  let nan = 0;
  let rendered = 0;
  for (const t of unique) {
    try {
      const html = arenaMarkup(view, t);
      rendered++;
      if (/NaN|Infinity|undefined/.test(html)) nan++;
    } catch (e) {
      thrown = `tick ${t}: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }
  }
  if (thrown) bad(`rendering threw - ${thrown}`);
  else ok(`rendered ${rendered} distinct ticks without throwing`);

  if (nan === 0) ok('no NaN, Infinity or undefined leaked into the markup');
  else bad(`${nan} tick(s) produced invalid numbers in the markup`);
}

// ---------------------------------------------------------------------------
// 2. the SVG contract
// ---------------------------------------------------------------------------
{
  const html = arenaMarkup(view, Math.floor(view.totalTicks / 2));
  if (html.includes('viewBox="0 0 1000 1000"')) ok('arena viewBox is the expected square');
  else bad('arena viewBox changed');

  // 4.3 channel 3: exactly one Core marker per bot.
  const coreGroups = (html.match(/class="pointer-events-none"[\s\S]*?<\/g>/g) ?? []).length;
  if (coreGroups >= 2) ok(`both Core markers present (${coreGroups} marker groups)`);
  else bad(`only ${coreGroups} Core marker group(s) found`);

  // The team badge must actually differ in the markup.
  const notchLines = (html.match(/stroke="#FFFFFF" stroke-width="3"/g) ?? []).length;
  if (notchLines === 4) ok('team B carries exactly 4 badge notches; team A none');
  else bad(`badge notches wrong: expected 4, found ${notchLines}`);
}

// ---------------------------------------------------------------------------
// 3. batching holds at render time, not just in the unit
// ---------------------------------------------------------------------------
{
  const countPaths = (html: string) => (html.match(/<path/g) ?? []).length;
  const small = makeView(glassCannon!, spear!, 3); // 24 tiles
  const large = makeView(spinner!, spear!, 3); // 28 tiles

  const a = countPaths(arenaMarkup(small, 10));
  const b = countPaths(arenaMarkup(large, 10));
  // The count may differ by a band or two, but it must not scale with the body.
  if (Math.abs(a - b) <= 6) ok(`path count stays flat across body sizes (${a} vs ${b})`);
  else bad(`path count scales with the body: ${a} vs ${b}`);

  if (a < 60) ok(`total paths per frame is small (${a}), nowhere near one per tile`);
  else bad(`too many paths per frame: ${a}`);
}

// ---------------------------------------------------------------------------
// 4. colours come from the palette, not from someone's memory
// ---------------------------------------------------------------------------
{
  const html = arenaMarkup(view, Math.floor(view.totalTicks / 2));
  const used = [...html.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!.toUpperCase());
  const allowed = paletteColorSpace();
  const strays = [...new Set(used.filter((c) => !allowed.has(c)))];
  if (strays.length === 0) {
    ok(`all ${new Set(used).size} colours in the markup are ones the palette can produce`);
  } else {
    bad(`colours typed by hand instead of read from the palette: ${strays.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// 5. the damage map actually paints heat
// ---------------------------------------------------------------------------
{
  const mid = Math.floor(view.totalTicks / 2);
  const plain = arenaMarkup(view, mid, false);
  const heat = arenaMarkup(view, mid, true);

  const heatStops = [0.3, 0.55, 0.8, 1].map((t) => heatColor(t).toUpperCase());
  const heatPresent = heatStops.filter((c) => heat.toUpperCase().includes(c));
  if (heatPresent.length > 0) ok(`damage map paints heat (${heatPresent.length}/${heatStops.length} bands in use at mid-match)`);
  else bad('damage map produced no heat colours');

  // 4.6: the outline must survive, so team and type stay readable with the map on.
  const outlineStroke = 'stroke="#8E2A20"';
  if (plain.includes(outlineStroke) && heat.includes(outlineStroke)) {
    ok('outlines survive the damage map (4.6: the map replaces the fill only)');
  } else {
    bad('the damage map clobbered the outlines');
  }
}

// ---------------------------------------------------------------------------
// 6. the shrinking ring only appears when the ruleset says so
// ---------------------------------------------------------------------------
{
  const before = arenaMarkup(view, 0);
  const during = arenaMarkup(view, ruleset.RING_START_TICK + 30);
  const ringStroke = 'stroke="#888780"';
  if (!before.includes(ringStroke) && during.includes(ringStroke)) {
    ok(`the ring is absent before tick ${ruleset.RING_START_TICK} and present after it`);
  } else {
    bad('the ring does not follow RING_START_TICK');
  }
}

// ---------------------------------------------------------------------------
// 7. a detached cluster leaves a cosmetic ghost
// ---------------------------------------------------------------------------
{
  const detach = view.replay.events.find((e) => e.kind === 'detach');
  if (!detach) {
    ok('this match has no detachment to check (skipped)');
  } else {
    const after = arenaMarkup(view, detach.tick + 3);
    if (after.includes('#B4B2A9')) ok('a detached cluster leaves a silver ghost (4.8)');
    else bad('detachment produced no ghost');
    const long = arenaMarkup(view, detach.tick + Math.round(ruleset.TICK_RATE * 2));
    if (!long.includes('#B4B2A9')) ok('the ghost is gone two seconds later');
    else bad('the ghost never fades');
  }
}

// ---------------------------------------------------------------------------
// 8. every other screen renders too
// ---------------------------------------------------------------------------
{
  const frame = view.frameAt(Math.floor(view.totalTicks / 2));
  const feed = view.replay.events.slice(0, 50).map((e, i) => {
    const d = view.describeEvent(e, 'Spear', 'Flanker');
    return { id: String(i), tick: d.tick, timeSec: d.tick / view.tickRate, title: d.title, detail: d.detail, kind: d.kind, team: d.team, critical: d.critical };
  });

  const screens: Array<[string, () => string]> = [
    ['TopHud', () => renderToStaticMarkup(<TopHud a={frame.a} b={frame.b} currentTimeStr="00:12" isLive />)],
    [
      'LeftBotInspector',
      () =>
        renderToStaticMarkup(
          <LeftBotInspector bot={frame.a} side="A" selected={{ team: 'A', index: 0 }} onEditBot={() => undefined} />,
        ),
    ],
    [
      'RightMatchEvents',
      () =>
        renderToStaticMarkup(
          <RightMatchEvents
            events={feed}
            currentTick={frame.tick}
            damageMapActive
            onToggleDamageMap={() => undefined}
            onEventClick={() => undefined}
            hottest={view.hottestTiles(frame.tick)}
          />,
        ),
    ],
    [
      'BottomReplayBar',
      () =>
        renderToStaticMarkup(
          <BottomReplayBar
            isPlaying={false}
            onTogglePlay={() => undefined}
            currentTimeSec={5}
            totalTimeSec={view.durationSec}
            onSeek={() => undefined}
            onStepTick={() => undefined}
            speed={1}
            onSpeedChange={() => undefined}
            damageMapActive={false}
            onToggleDamageMap={() => undefined}
            eventsOpen
            onToggleEvents={() => undefined}
            inspectorOpen
            onToggleInspector={() => undefined}
            markers={feed.map((f) => ({ id: f.id, timeSec: f.timeSec, tick: f.tick, title: f.title, critical: f.critical, team: f.team }))}
            gridActive
            onToggleGrid={() => undefined}
            vectorsActive={false}
            onToggleVectors={() => undefined}
          />,
        ),
    ],
    ['BotEditor', () => renderToStaticMarkup(<BotEditor definition={spear!} onChange={() => undefined} />)],
  ];

  for (const [name, render] of screens) {
    try {
      const html = render();
      if (html.length === 0) bad(`${name} rendered nothing`);
      else if (/NaN|Infinity/.test(html)) bad(`${name} produced invalid numbers`);
      else ok(`${name} renders (${html.length} chars)`);
    } catch (e) {
      bad(`${name} threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Every tile type must be reachable in the editor's palette.
  const editor = renderToStaticMarkup(<BotEditor definition={spinner!} onChange={() => undefined} />);
  const types: TriType[] = ['hammer', 'scissor', 'paper', 'motor'];
  const missing = types.filter((t) => !editor.toLowerCase().includes(t === 'scissor' ? 'kéo' : t === 'hammer' ? 'búa' : t === 'paper' ? 'bao' : 'motor'));
  if (missing.length === 0) ok('the editor offers all four tile types');
  else bad(`the editor is missing tools for: ${missing.join(', ')}`);
}

console.log(failures === 0 ? '\nall render checks passed' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
