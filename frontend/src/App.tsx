import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BotDefinition, ValidationReport } from '@promptchien/contracts';
import { SAMPLE_BOTS } from '@promptchien/core';
import { Header, type Tab } from './components/Header';
import { TopHud } from './components/TopHud';
import { LeftBotInspector } from './components/LeftBotInspector';
import { RightMatchEvents, type FeedEvent } from './components/RightMatchEvents';
import { BottomReplayBar, type TimelineMarker } from './components/BottomReplayBar';
import { BattleArena } from './components/BattleArena';
import { BotEditor } from './components/BotEditor';
import type { TileRef } from './lab/battleTypes';
import { labStore } from './lab/store';
import { blankBot, cloneDefinition, ruleset, validate, validateAndLock } from './lab/lab';
import { useLabState, useMatchSession, usePlayback } from './lab/useLab';
import { settingsFor, useQualityTier } from './lab/quality';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Battle');
  const [aspectLock, setAspectLock] = useState(false);

  const lab = useLabState();
  const session = useMatchSession();
  const playback = usePlayback(session.view);
  const view = session.view;
  const frame = useMemo(
    () => (view ? view.frameAt(playback.tickFloat) : null),
    [view, playback.tickFloat],
  );

  // ky_thuat_my_thuat.md 5.3/5.4: measure the frame rate, then apply the speed
  // based level of detail on top of the tier.
  const qualityTier = useQualityTier(playback.playing);
  const quality = useMemo(() => settingsFor(qualityTier, playback.speed), [qualityTier, playback.speed]);

  const [selectedTile, setSelectedTile] = useState<TileRef | null>(null);
  const [damageMapActive, setDamageMapActive] = useState(false);
  const [gridActive, setGridActive] = useState(true);
  const [vectorsActive, setVectorsActive] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(true);

  // ---- workshop state ------------------------------------------------------
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editorDef, setEditorDef] = useState<BotDefinition | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [opponentIndex, setOpponentIndex] = useState(1);

  const drafts = useMemo(
    () => Object.values(lab.drafts).sort((a, b) => a.ordinal - b.ordinal),
    [lab.drafts],
  );

  // First run: seed a draft from the reference Spear bot and fight a demo match,
  // so the Battle tab is never an empty screen.
  useEffect(() => {
    if (drafts.length > 0) return;
    const seed = SAMPLE_BOTS[0]!;
    const d = labStore.createDraft(cloneDefinition(seed));
    setEditingDraftId(d.id);
    setEditorDef(cloneDefinition(seed));
    session.run(cloneDefinition(SAMPLE_BOTS[0]!), cloneDefinition(SAMPLE_BOTS[2]!), 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingDraftId && lab.drafts[editingDraftId]) return;
    const first = drafts[0];
    if (first) {
      setEditingDraftId(first.id);
      setEditorDef(cloneDefinition(first.definition));
      setReport(null);
    }
  }, [drafts, editingDraftId, lab.drafts]);

  const selectDraft = (id: string) => {
    const d = lab.drafts[id];
    if (!d) return;
    setEditingDraftId(id);
    setEditorDef(cloneDefinition(d.definition));
    setReport(null);
    labStore.setActiveDraft(id);
  };

  const onEditorChange = useCallback(
    (def: BotDefinition) => {
      setEditorDef(def);
      setReport(null);
      if (editingDraftId) labStore.updateDraft(editingDraftId, def);
    },
    [editingDraftId],
  );

  // ---- actions -------------------------------------------------------------

  const doValidate = () => {
    if (!editorDef) return;
    setReport(validate(editorDef));
  };

  const doSaveVersion = () => {
    if (!editorDef || !editingDraftId) return;
    const r = validateAndLock(editingDraftId, editorDef);
    setReport(r.report);
  };

  const doEnqueue = () => {
    if (!editingDraftId) return;
    const draft = lab.drafts[editingDraftId];
    if (!draft || draft.versionKeys.length === 0) {
      setReport({
        botHash: '',
        engineVersion: '',
        rulesetVersion: ruleset.version,
        ok: false,
        issues: [
          {
            code: 'NO_VERSION',
            severity: 'error',
            message: 'Chưa có phiên bản nào được khoá. Bấm “Kiểm tra & khoá phiên bản” trước.',
          },
        ],
        stats: null,
        sandbox: null,
      });
      return;
    }
    const last = draft.versionKeys[draft.versionKeys.length - 1]!;
    const v = labStore.getVersion(last);
    if (v) labStore.enqueue(v);
  };

  const doRunTest = () => {
    if (!editorDef) return;
    const foe = SAMPLE_BOTS[opponentIndex] ?? SAMPLE_BOTS[0]!;
    session.run(editorDef, cloneDefinition(foe), 11 + opponentIndex);
    setActiveTab('Battle');
  };

  const doRunQueued = () => {
    session.runQueued();
    setActiveTab('Battle');
  };

  // ---- derived view data ---------------------------------------------------

  const feed: FeedEvent[] = useMemo(() => {
    if (!view) return [];
    const nameA = view.replay.manifest.botA.name;
    const nameB = view.replay.manifest.botB.name;
    return view.replay.events.map((e, i) => {
      const d = view.describeEvent(e, nameA, nameB);
      return {
        id: `${i}`,
        tick: d.tick,
        timeSec: d.tick / view.tickRate,
        title: d.title,
        detail: d.detail,
        kind: d.kind,
        team: d.team,
        critical: d.critical,
      };
    });
  }, [view]);

  const markers: TimelineMarker[] = useMemo(
    () => feed.map((f) => ({ id: f.id, timeSec: f.timeSec, tick: f.tick, title: f.title, critical: f.critical, team: f.team })),
    [feed],
  );

  const hottest = useMemo(
    () => (view && frame && damageMapActive ? view.hottestTiles(frame.tick) : []),
    [view, frame, damageMapActive],
  );

  const waiting = lab.queue.filter((q) => q.status === 'waiting');

  // ---- keyboard ------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          playback.setPlaying(!playback.playing);
          break;
        case 'ArrowLeft':
          playback.stepTick(-1);
          break;
        case 'ArrowRight':
          playback.stepTick(1);
          break;
        default:
          break;
      }
      if (e.key === 'd' || e.key === 'D') setDamageMapActive((p) => !p);
      if (e.key === 'g' || e.key === 'G') setGridActive((p) => !p);
      if (e.key === 'v' || e.key === 'V') setVectorsActive((p) => !p);
      if (e.key === 'e' || e.key === 'E') setEventsOpen((p) => !p);
      if (e.key === 'i' || e.key === 'I') setInspectorOpen((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const editorDraft = editingDraftId ? lab.drafts[editingDraftId] : undefined;
  const outcome = session.outcome?.match.outcome;

  return (
    <div className="w-screen h-screen flex flex-col bg-[#f8fafc] text-neutral-900 overflow-hidden font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        aspectLock={aspectLock}
        setAspectLock={setAspectLock}
        persistenceWarning={labStore.persistenceError}
      />

      {activeTab === 'Battle' && (
        <>
          <main className="flex-1 w-full relative overflow-hidden flex items-center justify-center p-2 sm:p-4">
            <div
              className={`relative w-full h-full bg-white rounded-2xl border border-neutral-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col ${
                aspectLock ? 'max-w-[1440px] max-h-[810px] aspect-video mx-auto my-auto' : ''
              }`}
            >
              <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
                <TopHud
                  a={frame?.a ?? null}
                  b={frame?.b ?? null}
                  currentTimeStr={formatTime(playback.tickFloat / (view?.tickRate ?? 30))}
                  isLive={playback.playing}
                />
              </div>

              {inspectorOpen && (
                <div className="absolute top-[116px] left-6 z-20 pointer-events-none">
                  <LeftBotInspector
                    bot={frame?.a ?? null}
                    side="A"
                    selected={selectedTile}
                    onEditBot={() => setActiveTab('Bots')}
                  />
                </div>
              )}

              {eventsOpen && (
                <div className="absolute top-[116px] right-6 z-20 pointer-events-none">
                  <RightMatchEvents
                    events={feed}
                    currentTick={frame?.tick ?? 0}
                    damageMapActive={damageMapActive}
                    onToggleDamageMap={() => setDamageMapActive((p) => !p)}
                    onEventClick={(e) => playback.seekTick(e.tick)}
                    hottest={hottest}
                  />
                </div>
              )}

              <div className="flex-1 w-full h-full relative">
                <BattleArena
                  view={view}
                  frame={frame}
                  tickFloat={playback.tickFloat}
                  isPlaying={playback.playing}
                  damageMapActive={damageMapActive}
                  gridActive={gridActive}
                  vectorsActive={vectorsActive}
                  selected={selectedTile}
                  onSelect={setSelectedTile}
                  quality={quality}
                />
              </div>

              {!view && (
                <div className="absolute inset-x-0 bottom-20 flex flex-col items-center gap-2 z-30">
                  <button
                    onClick={() => session.run(cloneDefinition(SAMPLE_BOTS[0]!), cloneDefinition(SAMPLE_BOTS[2]!), 7)}
                    className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800"
                  >
                    Chạy một trận mẫu
                  </button>
                </div>
              )}

              {outcome && !playback.playing && playback.tickFloat >= (view?.totalTicks ?? 0) - 2 && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                  <div className="px-6 py-4 rounded-2xl bg-white/95 backdrop-blur border border-neutral-200 shadow-xl text-center">
                    <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest">kết quả</div>
                    <div className="text-xl font-bold text-neutral-900 mt-1">
                      {outcome.winner === 'draw'
                        ? 'HÒA'
                        : `${outcome.winner === 'A' ? view?.replay.manifest.botA.name : view?.replay.manifest.botB.name} THẮNG`}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 mt-1">
                      {outcome.reason === 'core'
                        ? 'phá vỡ lõi'
                        : outcome.reason === 'incap'
                          ? 'địch mất khả năng chiến đấu'
                          : `hết giờ · điểm ${outcome.scoreA} - ${outcome.scoreB}`}
                      {' · '}
                      {(outcome.ticks / (view?.tickRate ?? 30)).toFixed(1)}s
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <BottomReplayBar
            isPlaying={playback.playing}
            onTogglePlay={() => playback.setPlaying(!playback.playing)}
            currentTimeSec={playback.tickFloat / (view?.tickRate ?? 30)}
            totalTimeSec={view?.durationSec ?? 0}
            onSeek={playback.seekSec}
            onStepTick={playback.stepTick}
            speed={playback.speed}
            onSpeedChange={playback.setSpeed}
            damageMapActive={damageMapActive}
            onToggleDamageMap={() => setDamageMapActive((p) => !p)}
            eventsOpen={eventsOpen}
            onToggleEvents={() => setEventsOpen((p) => !p)}
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((p) => !p)}
            markers={markers}
            gridActive={gridActive}
            onToggleGrid={() => setGridActive((p) => !p)}
            vectorsActive={vectorsActive}
            onToggleVectors={() => setVectorsActive((p) => !p)}
          />
        </>
      )}

      {activeTab === 'Bots' && (
        <Workshop
          drafts={drafts}
          editorDraft={editorDraft}
          editorDef={editorDef}
          report={report}
          onSelectDraft={selectDraft}
          onChange={onEditorChange}
          onValidate={doValidate}
          onSaveVersion={doSaveVersion}
          onEnqueue={doEnqueue}
          onNewDraft={() => {
            const d = labStore.createDraft(blankBot(`Bot ${drafts.length + 1}`));
            selectDraft(d.id);
          }}
          onLoadSample={(i) => {
            const d = labStore.createDraft(cloneDefinition(SAMPLE_BOTS[i]!));
            selectDraft(d.id);
          }}
          onDeleteDraft={(id) => labStore.deleteDraft(id)}
          versionsOf={(id) => lab.drafts[id]?.versionKeys ?? []}
        />
      )}

      {activeTab === 'Lab' && (
        <LabPanel
          report={report}
          opponentIndex={opponentIndex}
          setOpponentIndex={setOpponentIndex}
          onRunTest={doRunTest}
          onRunQueued={doRunQueued}
          waiting={waiting.length}
          sessionError={session.error}
          running={session.running}
          onValidate={doValidate}
        />
      )}

      {activeTab === 'Replays' && (
        <ReplaysPanel
          matches={[...lab.matches].reverse()}
          onOpen={(matchId) => {
            const m = lab.matches.find((x) => x.matchId === matchId);
            if (!m) return;
            session.run(m.a.definition, m.b.definition, m.seed);
            setActiveTab('Battle');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workshop
// ---------------------------------------------------------------------------

const Workshop: React.FC<{
  drafts: ReturnType<typeof useLabState>['drafts'][string][];
  editorDraft: ReturnType<typeof useLabState>['drafts'][string] | undefined;
  editorDef: BotDefinition | null;
  report: ValidationReport | null;
  onSelectDraft: (id: string) => void;
  onChange: (def: BotDefinition) => void;
  onValidate: () => void;
  onSaveVersion: () => void;
  onEnqueue: () => void;
  onNewDraft: () => void;
  onLoadSample: (i: number) => void;
  onDeleteDraft: (id: string) => void;
  versionsOf: (id: string) => string[];
}> = ({
  drafts,
  editorDraft,
  editorDef,
  report,
  onSelectDraft,
  onChange,
  onValidate,
  onSaveVersion,
  onEnqueue,
  onNewDraft,
  onLoadSample,
  onDeleteDraft,
  versionsOf,
}) => {
  return (
    <main className="flex-1 w-full overflow-hidden flex">
      <aside className="w-64 border-r border-neutral-200 bg-white overflow-y-auto p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold font-mono text-neutral-700">BẢN NHÁP</span>
          <button
            onClick={onNewDraft}
            className="text-[11px] font-semibold text-neutral-600 border border-neutral-200 rounded px-1.5 py-0.5 hover:border-neutral-500"
          >
            + mới
          </button>
        </div>

        {drafts.map((d) => (
          <div
            key={d.id}
            className={`group rounded-lg border p-2 cursor-pointer transition-colors ${
              editorDraft?.id === d.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'
            }`}
            onClick={() => onSelectDraft(d.id)}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-neutral-800 truncate">{d.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDraft(d.id);
                }}
                className="text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs px-1"
              >
                ×
              </button>
            </div>
            <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
              {d.definition.triangles.length} tam giác · {d.versionKeys.length} phiên bản
            </div>
          </div>
        ))}

        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="text-[11px] font-bold font-mono text-neutral-700 mb-2">BOT MẪU</div>
          <div className="flex flex-col gap-1">
            {SAMPLE_BOTS.map((b, i) => (
              <button
                key={b.name}
                onClick={() => onLoadSample(i)}
                className="text-left text-[11px] font-mono text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded px-2 py-1"
              >
                {b.name} · {b.triangles.length} ô
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto p-4">
        {!editorDef ? (
          <p className="text-sm text-neutral-400 font-mono">chọn hoặc tạo một bản nháp</p>
        ) : (
          <div className="max-w-4xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <input
                value={editorDef.name}
                onChange={(e) => onChange({ ...editorDef, name: e.target.value })}
                className="text-lg font-bold text-neutral-900 border-b border-transparent focus:border-neutral-400 outline-none bg-transparent"
              />
              <span className="text-[11px] font-mono text-neutral-400">
                {versionsOf(editorDraft?.id ?? '').length} phiên bản đã khoá
              </span>
            </div>

            <BotEditor definition={editorDef} onChange={onChange} />

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onValidate}
                className="px-3 py-1.5 rounded-lg bg-neutral-100 border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
              >
                Kiểm tra
              </button>
              <button
                onClick={onSaveVersion}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800"
              >
                Kiểm tra &amp; khoá phiên bản
              </button>
              <button
                onClick={onEnqueue}
                className="px-3 py-1.5 rounded-lg bg-white border border-neutral-300 text-xs font-semibold text-neutral-700 hover:border-neutral-500"
              >
                Xếp hàng chờ
              </button>
            </div>

            {report && <ReportCard report={report} />}
          </div>
        )}
      </section>
    </main>
  );
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const ReportCard: React.FC<{ report: ValidationReport }> = ({ report }) => {
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  return (
    <div
      className={`rounded-xl border p-3 ${
        report.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold font-mono ${report.ok ? 'text-emerald-800' : 'text-red-800'}`}>
          {report.ok ? 'ĐẠT KIỂM DUYỆT' : 'KHÔNG ĐẠT'}
        </span>
        {report.botHash && (
          <span className="text-[10px] font-mono text-neutral-500">hash {report.botHash.slice(0, 16)}…</span>
        )}
      </div>

      {errors.length === 0 && warnings.length === 0 && (
        <p className="text-[11px] font-mono text-neutral-500">không có vấn đề gì</p>
      )}

      <div className="flex flex-col gap-1.5">
        {errors.map((i, k) => (
          <div key={`e${k}`} className="text-[11px] leading-snug">
            <span className="font-mono font-bold text-red-700">{i.code}</span>
            <span className="text-neutral-700"> — {i.message}</span>
          </div>
        ))}
        {warnings.map((i, k) => (
          <div key={`w${k}`} className="text-[11px] leading-snug">
            <span className="font-mono font-bold text-amber-700">{i.code}</span>
            <span className="text-neutral-600"> — {i.message}</span>
          </div>
        ))}
      </div>

      {report.stats && (
        <div className="mt-3 pt-2 border-t border-black/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
          <Stat label="Tam giác" value={String(report.stats.triangles)} />
          <Stat label="Chiến đấu" value={String(report.stats.combat)} />
          <Stat label="Motor" value={String(report.stats.motors)} />
          <Stat label="Hệ số tải" value={(report.stats.loadMilli / 1000).toFixed(2)} />
          <Stat label="Tốc độ" value={`${(report.stats.speedMultiplierMilli / 10).toFixed(0)}%`} />
          <Stat label="Lõi" value={report.stats.coreType} />
          <Stat
            label="Kích thước"
            value={`${(report.stats.spanXMilli / 1000).toFixed(1)}×${(report.stats.spanYMilli / 1000).toFixed(1)}`}
          />
          <Stat label="Thuần chủng" value={`${(report.stats.monoShareMilli / 10).toFixed(0)}%`} />
        </div>
      )}

      {report.sandbox && (
        <div className="mt-3 pt-2 border-t border-black/5">
          <div className="text-[10px] font-bold font-mono text-neutral-500 mb-1">
            SANDBOX · {report.sandbox.passed ? 'đạt' : 'không đạt'} ({report.sandbox.positions.length} vị trí)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {report.sandbox.positions.map((p) => (
              <div
                key={p.seed}
                className={`rounded border px-1.5 py-1 text-[10px] font-mono ${
                  p.passed ? 'border-emerald-200 text-emerald-800' : 'border-red-200 text-red-800'
                }`}
                title={p.failure ?? 'đạt'}
              >
                #{p.seed} {p.passed ? '✓' : '✗'} · chạm {p.contactTicks}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-neutral-400 text-[10px]">{label}</div>
    <div className="text-neutral-800 font-semibold">{value}</div>
  </div>
);

// ---------------------------------------------------------------------------
// Lab
// ---------------------------------------------------------------------------

const LabPanel: React.FC<{
  report: ValidationReport | null;
  opponentIndex: number;
  setOpponentIndex: (i: number) => void;
  onRunTest: () => void;
  onRunQueued: () => void;
  waiting: number;
  sessionError: string | null;
  running: boolean;
  onValidate: () => void;
}> = ({ report, opponentIndex, setOpponentIndex, onRunTest, onRunQueued, waiting, sessionError, running, onValidate }) => (
  <main className="flex-1 w-full overflow-y-auto p-6">
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <h2 className="text-lg font-bold text-neutral-900">Phòng thử</h2>
      <p className="text-[12px] text-neutral-500 leading-relaxed">
        Chạy thử bot đang mở trong xưởng với một bot mẫu. Trận thử không khoá phiên bản và không vào hàng chờ —
        chỉ để xem con bot của mày hành xử ra sao.
      </p>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <label className="text-[11px] font-mono text-neutral-500">Đối thủ</label>
          <select
            value={opponentIndex}
            onChange={(e) => setOpponentIndex(Number(e.target.value))}
            className="text-[12px] font-mono border border-neutral-200 rounded px-2 py-1 bg-white"
          >
            {SAMPLE_BOTS.map((b, i) => (
              <option key={b.name} value={i}>
                {b.name} ({b.triangles.length} ô)
              </option>
            ))}
          </select>
          <button
            onClick={onValidate}
            className="px-3 py-1.5 rounded-lg bg-neutral-100 border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
          >
            Kiểm tra lại
          </button>
          <button
            onClick={onRunTest}
            disabled={running}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50"
          >
            {running ? 'đang chạy…' : 'Chạy trận thử'}
          </button>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
          <span className="text-[11px] font-mono text-neutral-500">
            Hàng chờ: <b className="text-neutral-800">{waiting}</b> bot đang đợi
          </span>
          <button
            onClick={onRunQueued}
            disabled={running || waiting < 2}
            className="px-3 py-1.5 rounded-lg bg-white border border-neutral-300 text-xs font-semibold text-neutral-700 hover:border-neutral-500 disabled:opacity-40"
            title={waiting < 2 ? 'Cần ít nhất hai bot khác nhau đang chờ' : 'Ghép hai bot cũ nhất trong hàng'}
          >
            Ghép trận từ hàng chờ
          </button>
          {waiting < 2 && (
            <span className="text-[11px] text-neutral-400">
              (khoá phiên bản và bấm “Xếp hàng chờ” ở tab Xưởng bot để thêm bot)
            </span>
          )}
        </div>

        {sessionError && (
          <div className="text-[11px] font-mono text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {sessionError}
          </div>
        )}
      </div>

      {report ? <ReportCard report={report} /> : (
        <p className="text-[12px] font-mono text-neutral-400">
          chưa có báo cáo — bấm “Kiểm tra lại”
        </p>
      )}
    </div>
  </main>
);

// ---------------------------------------------------------------------------
// Replays
// ---------------------------------------------------------------------------

const ReplaysPanel: React.FC<{
  matches: Array<{
    matchId: string;
    seed: number;
    a: { name: string; hash: string };
    b: { name: string; hash: string };
    outcome: { winner: string; reason: string; ticks: number; scoreA: number; scoreB: number };
    replayHash: string;
  }>;
  onOpen: (matchId: string) => void;
}> = ({ matches, onOpen }) => (
  <main className="flex-1 w-full overflow-y-auto p-6">
    <div className="max-w-3xl mx-auto flex flex-col gap-3">
      <h2 className="text-lg font-bold text-neutral-900">Băng ghi</h2>
      <p className="text-[12px] text-neutral-500 leading-relaxed">
        Mỗi trận lưu lại hai gói bot và seed, không lưu cả băng hình. Vì engine tất định — cùng bot, cùng seed
        là cùng trận — nên băng ghi được dựng lại y hệt khi mở. Đây cũng đúng cách lệnh kiểm chứng ở CLI làm việc.
      </p>

      {matches.length === 0 && <p className="text-[12px] font-mono text-neutral-400">chưa có trận nào</p>}

      {matches.map((m) => (
        <button
          key={m.matchId}
          onClick={() => onOpen(m.matchId)}
          className="text-left rounded-xl border border-neutral-200 bg-white p-3 hover:border-neutral-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-neutral-800">
              {m.a.name} <span className="text-neutral-400 font-mono text-[11px]">vs</span> {m.b.name}
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              {m.outcome.winner === 'draw' ? 'hòa' : `${m.outcome.winner} thắng`} ·{' '}
              {m.outcome.reason === 'core' ? 'phá lõi' : m.outcome.reason === 'incap' ? 'mất khả năng' : 'hết giờ'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400 mt-1">
            seed {m.seed} · {m.outcome.ticks} nhịp · điểm {m.outcome.scoreA}-{m.outcome.scoreB} · replay{' '}
            {m.replayHash.slice(0, 12)}…
          </div>
        </button>
      ))}
    </div>
  </main>
);
