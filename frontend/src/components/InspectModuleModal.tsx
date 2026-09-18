import React from 'react';
import { TriangleCell, BotData } from '../types';
import { X, Activity, Shield, Zap, GitCommit, Layers, AlertOctagon } from 'lucide-react';

interface InspectModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTriangle: TriangleCell | null;
  botA: BotData;
  botB: BotData;
}

export const InspectModuleModal: React.FC<InspectModuleModalProps> = ({
  isOpen,
  onClose,
  selectedTriangle,
  botA,
  botB,
}) => {
  if (!isOpen) return null;

  // Default to primary core cell of Bot A if none selected
  const activeCell =
    selectedTriangle ||
    botA.modules.find((m) => m.isCore) ||
    botA.modules[0];

  const parentBot = activeCell.botId === 'A' ? botA : botB;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs select-none">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-neutral-200 shadow-2xl p-6 relative flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              TELEMETRY INSPECTOR
            </span>
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2 font-mono">
              CELL #{activeCell.id}
              <span
                className={`text-xs px-2 py-0.5 rounded font-sans font-semibold ${
                  activeCell.botId === 'A'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {parentBot.name}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Geometric cell schematic preview */}
        <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200/80">
          <div className="w-20 h-20 bg-white rounded-lg border border-neutral-200 flex items-center justify-center relative shadow-xs shrink-0">
            <svg viewBox="-25 -25 50 50" className="w-16 h-16">
              <polygon
                points="0,-18 16,12 -16,12"
                fill={activeCell.type === 'hammer' ? '#dc2626' : activeCell.type === 'motor' ? '#fef3c7' : '#ffffff'}
                stroke={activeCell.botId === 'A' ? '#991b1b' : '#1d4ed8'}
                strokeWidth={activeCell.type === 'hammer' ? '2.5' : '1.5'}
                strokeDasharray={activeCell.type === 'motor' ? '3 1.5' : undefined}
              />
              {activeCell.isCore && (
                <circle cx="0" cy="0" r="14" fill="none" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="3 2" />
              )}
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-neutral-900 uppercase font-mono">
                {activeCell.type} MODULE
              </span>
              {activeCell.isCore && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  VITAL CORE
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1 font-sans">
              {activeCell.type === 'hammer' && 'Heavy kinetic punch. Multiplies damage against Scissor modules.'}
              {activeCell.type === 'scissor' && 'Aerodynamic razor edge. High shear speed, effective against Paper mesh.'}
              {activeCell.type === 'paper' && 'Flexible elastic dampener. Absorbs blunt Hammer impacts and houses core.'}
              {activeCell.type === 'motor' && 'Directional impulse actuator. Generates fluid locomotion and torque.'}
            </p>
          </div>
        </div>

        {/* Diagnostics Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-400 uppercase">Structural Integrity</span>
            <div className="text-base font-bold text-neutral-900 mt-0.5">{activeCell.hp}%</div>
            <div className="w-full h-1.5 rounded-full bg-neutral-200 mt-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${activeCell.hp}%` }}
              />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-400 uppercase">Kinetic Stress</span>
            <div className="text-base font-bold text-orange-600 mt-0.5">{activeCell.stress}%</div>
            <div className="w-full h-1.5 rounded-full bg-neutral-200 mt-1.5 overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${activeCell.stress}%` }}
              />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-400 uppercase">Tessellation Grid</span>
            <div className="text-sm font-semibold text-neutral-900 mt-0.5">
              {activeCell.gridC !== undefined ? `[Col ${activeCell.gridC}, Row ${activeCell.gridR}]` : '3 Tri-Node Bonds'}
            </div>
            <span className="text-[10px] text-sky-600">Edge-to-Edge Coincident</span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-400 uppercase">Kinetic Mass</span>
            <div className="text-sm font-semibold text-neutral-900 mt-0.5">
              {activeCell.type === 'hammer' ? '1.8 kg' : '0.9 kg'}
            </div>
            <span className="text-[10px] text-neutral-500">Inertial factor 1.0</span>
          </div>
        </div>

        {/* Footer close */}
        <div className="flex justify-end pt-2 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-all shadow-xs"
          >
            Close Telemetry
          </button>
        </div>
      </div>
    </div>
  );
};
