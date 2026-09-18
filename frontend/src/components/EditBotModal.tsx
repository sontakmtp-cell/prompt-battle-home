import React, { useState } from 'react';
import { BotData, TriangleType } from '../types';
import { X, Sparkles, Sliders, CheckCircle2, Cpu, Terminal, ArrowRight } from 'lucide-react';

interface EditBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: BotData;
  onSaveBot: (updatedBot: BotData) => void;
}

export const EditBotModal: React.FC<EditBotModalProps> = ({
  isOpen,
  onClose,
  bot,
  onSaveBot,
}) => {
  const [promptText, setPromptText] = useState(
    bot.tacticalBrain.promptSnippet
  );
  const [directiveText, setDirectiveText] = useState(
    bot.tacticalBrain.directive
  );
  const [hammerCount, setHammerCount] = useState(bot.triangleCounts.hammer);
  const [scissorCount, setScissorCount] = useState(bot.triangleCounts.scissor);
  const [paperCount, setPaperCount] = useState(bot.triangleCounts.paper);
  const [motorCount, setMotorCount] = useState(bot.triangleCounts.motor);

  if (!isOpen) return null;

  const total = hammerCount + scissorCount + paperCount + motorCount;
  const maxModules = 60;
  const isValid = total === maxModules;

  const handleApplyPreset = (name: string) => {
    if (name === 'Spear Assault') {
      setHammerCount(18);
      setScissorCount(12);
      setPaperCount(15);
      setMotorCount(15);
      setDirectiveText('Aggressive · Direct Assault');
      setPromptText('Target enemy core; prioritize scissor clusters with hammer apex; maintain motor torque > 75%');
    } else if (name === 'Crescent Flanker') {
      setHammerCount(12);
      setScissorCount(20);
      setPaperCount(14);
      setMotorCount(14);
      setDirectiveText('Adaptive · Crescent Flank');
      setPromptText('Encircle attacking spear; isolate trailing motor modules; sweep with scissor sickle.');
    } else if (name === 'Defensive Bulwark') {
      setHammerCount(22);
      setScissorCount(8);
      setPaperCount(20);
      setMotorCount(10);
      setDirectiveText('Fortified · Core Guardian');
      setPromptText('Reinforce paper core cage with outer hammer plates; counter thrusts on contact.');
    }
  };

  const handleSave = () => {
    // Distribute new module types into existing tessellated grid cells, preserving core
    const newTypes: TriangleType[] = [];
    for (let i = 0; i < hammerCount; i++) newTypes.push('hammer');
    for (let i = 0; i < scissorCount; i++) newTypes.push('scissor');
    for (let i = 0; i < paperCount; i++) newTypes.push('paper');
    for (let i = 0; i < motorCount; i++) newTypes.push('motor');

    const updatedModules = bot.modules.map((m, idx) => {
      if (m.isCore) return m; // Core remains vital paper
      const assignedType = newTypes[idx] || m.type;
      return {
        ...m,
        type: assignedType,
      };
    });

    const updated: BotData = {
      ...bot,
      tacticalBrain: {
        ...bot.tacticalBrain,
        directive: directiveText,
        promptSnippet: promptText,
      },
      triangleCounts: {
        hammer: hammerCount,
        scissor: scissorCount,
        paper: paperCount,
        motor: motorCount,
      },
      modules: updatedModules,
      totalTriangles: total,
      activeTriangles: total,
    };
    onSaveBot(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs select-none">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-neutral-200 shadow-2xl p-6 relative flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              BOT ARCHITECT
            </span>
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Configure {bot.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI Strategy Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-neutral-800 font-sans flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-neutral-500" />
              AI Tactical Strategy Prompt
            </label>
            <span className="text-[10px] font-mono text-neutral-400">
              Natural Language → Autonomous Code
            </span>
          </div>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={3}
            className="w-full text-xs font-mono p-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:bg-white resize-none transition-all"
            placeholder="Describe tactical behavior, targeting priority, motor thrust curves..."
          />
        </div>

        {/* Quick Strategy Presets */}
        <div>
          <div className="text-[11px] font-semibold text-neutral-600 mb-1.5">
            Tactical Presets
          </div>
          <div className="flex items-center gap-2">
            {['Spear Assault', 'Crescent Flanker', 'Defensive Bulwark'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Module Budget Allocation */}
        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-neutral-500" />
              Triangle Module Allocation
            </span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {total} / {maxModules} Cells
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            {/* Hammer */}
            <div className="bg-white p-2 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 mb-1">
                <span className="w-2 h-2 rounded-xs bg-red-600" />
                Hammer
              </div>
              <input
                type="number"
                min="0"
                max="40"
                value={hammerCount}
                onChange={(e) => setHammerCount(parseInt(e.target.value) || 0)}
                className="w-full text-center font-bold text-sm bg-neutral-50 border rounded py-1"
              />
            </div>

            {/* Scissor */}
            <div className="bg-white p-2 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 mb-1">
                <span className="w-2 h-2 rounded-xs border border-orange-600 bg-white" />
                Scissor
              </div>
              <input
                type="number"
                min="0"
                max="40"
                value={scissorCount}
                onChange={(e) => setScissorCount(parseInt(e.target.value) || 0)}
                className="w-full text-center font-bold text-sm bg-neutral-50 border rounded py-1"
              />
            </div>

            {/* Paper */}
            <div className="bg-white p-2 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 mb-1">
                <span className="w-2 h-2 rounded-xs border border-dashed border-amber-600 bg-amber-50" />
                Paper
              </div>
              <input
                type="number"
                min="0"
                max="40"
                value={paperCount}
                onChange={(e) => setPaperCount(parseInt(e.target.value) || 0)}
                className="w-full text-center font-bold text-sm bg-neutral-50 border rounded py-1"
              />
            </div>

            {/* Motor */}
            <div className="bg-white p-2 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 mb-1">
                <span className="w-2 h-2 rounded-xs border border-dashed border-neutral-400 bg-neutral-100" />
                Motor
              </div>
              <input
                type="number"
                min="0"
                max="40"
                value={motorCount}
                onChange={(e) => setMotorCount(parseInt(e.target.value) || 0)}
                className="w-full text-center font-bold text-sm bg-neutral-50 border rounded py-1"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all ${
              isValid
                ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Compile & Deploy Bot</span>
          </button>
        </div>
      </div>
    </div>
  );
};
