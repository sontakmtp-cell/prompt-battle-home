import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BotData, TriangleCell, TriangleType } from '../types';

export interface CollisionParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  opacity: number;
  color: string;
  type: 'triangle' | 'shard' | 'spark' | 'dust';
}

interface BattleArenaProps {
  botA: BotData;
  botB: BotData;
  currentTimeSec: number;
  isPlaying: boolean;
  damageMapActive: boolean;
  gridActive: boolean;
  vectorsActive: boolean;
  onSelectTriangle: (triangle: TriangleCell | null) => void;
  selectedTriangleId: string | null;
  onTriggerImpact?: (intensity?: 'normal' | 'heavy') => void;
  isImpactShaking?: boolean;
}

export const BattleArena: React.FC<BattleArenaProps> = ({
  botA,
  botB,
  currentTimeSec,
  isPlaying,
  damageMapActive,
  gridActive,
  vectorsActive,
  onSelectTriangle,
  selectedTriangleId,
  onTriggerImpact,
  isImpactShaking = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTriangle, setHoveredTriangle] = useState<TriangleCell | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fluidPhase, setFluidPhase] = useState<number>(0);

  // Dynamic collision particles
  const [particles, setParticles] = useState<CollisionParticle[]>([]);
  const particlesRef = useRef<CollisionParticle[]>([]);
  const nextParticleIdRef = useRef<number>(1);
  const frameCountRef = useRef<number>(0);
  const prevTimeSecRef = useRef<number>(currentTimeSec);

  // Internal SVG stage micro-vibration for tactile impact feel
  const [stageShake, setStageShake] = useState<{ x: number; y: number; rot: number }>({ x: 0, y: 0, rot: 0 });
  const shakeTimerRef = useRef<number | null>(null);

  // Color palettes for geometric breakaway shards
  const warmShards = ['#ef4444', '#dc2626', '#ea580c', '#f59e0b', '#ffffff'];
  const coolShards = ['#3b82f6', '#2563eb', '#06b6d4', '#10b981', '#ffffff'];
  const dustShards = ['#94a3b8', '#cbd5e1', '#e2e8f0'];

  /**
   * Spawn a single geometric particle at target coordinate
   */
  const createParticle = useCallback(
    (
      originX: number,
      originY: number,
      isBurst = false,
      biasAngle?: number,
      customColor?: string
    ): CollisionParticle => {
      const id = nextParticleIdRef.current++;
      const angle = biasAngle !== undefined
        ? biasAngle + (Math.random() - 0.5) * 1.2
        : Math.random() * Math.PI * 2;

      const speed = isBurst
        ? 1.8 + Math.random() * 4.2
        : 0.5 + Math.random() * 1.6;

      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // Particle type: micro-triangles, sharp diamond shards, kinetic friction sparks, or micro dust
      const rand = Math.random();
      let type: CollisionParticle['type'] = 'triangle';
      if (rand < 0.35) type = 'triangle';
      else if (rand < 0.65) type = 'shard';
      else if (rand < 0.85) type = 'spark';
      else type = 'dust';

      // Pick cohesive palette
      let color = customColor;
      if (!color) {
        const pal = Math.random() > 0.5 ? warmShards : coolShards;
        color = Math.random() > 0.15 ? pal[Math.floor(Math.random() * pal.length)] : dustShards[Math.floor(Math.random() * dustShards.length)];
      }

      const maxLife = isBurst ? 35 + Math.floor(Math.random() * 40) : 25 + Math.floor(Math.random() * 30);

      return {
        id,
        x: originX + (Math.random() - 0.5) * 6,
        y: originY + (Math.random() - 0.5) * 6,
        vx,
        vy,
        size: isBurst ? 2.5 + Math.random() * 3.5 : 1.8 + Math.random() * 2.5,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * (isBurst ? 18 : 8),
        life: 0,
        maxLife,
        opacity: 0.95,
        color,
        type,
      };
    },
    []
  );

  /**
   * Trigger a kinetic particle burst at collision shear points
   */
  const emitImpactBurst = useCallback(
    (intensity: 'normal' | 'heavy' = 'normal') => {
      const count = intensity === 'heavy' ? 24 : 16;
      const newParticles: CollisionParticle[] = [];

      // Primary collision point (512, 305)
      for (let i = 0; i < count * 0.65; i++) {
        const bias = Math.random() > 0.5 ? Math.PI : 0; // Splintering away from contact line
        newParticles.push(createParticle(512, 305, true, bias));
      }

      // Detached scissor cell B-31 breakaway zone (503, 276)
      for (let i = 0; i < count * 0.35; i++) {
        newParticles.push(createParticle(503, 276, true, -Math.PI * 0.65, '#3b82f6'));
      }

      particlesRef.current = [...particlesRef.current.slice(-35), ...newParticles];

      // Internal stage shake decay loop
      if (shakeTimerRef.current) cancelAnimationFrame(shakeTimerRef.current);
      let shakeFrame = 0;
      const totalShakeFrames = intensity === 'heavy' ? 18 : 12;
      const maxDist = intensity === 'heavy' ? 4.5 : 2.5;

      const runStageShake = () => {
        shakeFrame++;
        if (shakeFrame <= totalShakeFrames) {
          const decay = 1 - shakeFrame / totalShakeFrames;
          setStageShake({
            x: (Math.random() - 0.5) * maxDist * decay,
            y: (Math.random() - 0.5) * maxDist * decay,
            rot: (Math.random() - 0.5) * 0.25 * decay,
          });
          shakeTimerRef.current = requestAnimationFrame(runStageShake);
        } else {
          setStageShake({ x: 0, y: 0, rot: 0 });
        }
      };
      shakeTimerRef.current = requestAnimationFrame(runStageShake);
    },
    [createParticle]
  );

  // Trigger burst when parent indicates impact shake
  useEffect(() => {
    if (isImpactShaking) {
      emitImpactBurst('heavy');
    }
  }, [isImpactShaking, emitImpactBurst]);

  // Check timeline progression for damage registration
  useEffect(() => {
    const prevSec = Math.floor(prevTimeSecRef.current);
    const currSec = Math.floor(currentTimeSec);
    prevTimeSecRef.current = currentTimeSec;

    // If scrubbed or ticked over critical damage seconds (38, 41, 42, 44, 45, 46)
    if (prevSec !== currSec) {
      const damageSeconds = [38, 41, 42, 44, 45, 46];
      if (damageSeconds.includes(currSec)) {
        const isCritical = [41, 44, 45, 46].includes(currSec);
        emitImpactBurst(isCritical ? 'heavy' : 'normal');
        onTriggerImpact?.(isCritical ? 'heavy' : 'normal');
      }
    }
  }, [currentTimeSec, emitImpactBurst, onTriggerImpact]);

  // Main animation frame loop: living fluid oscillation & particle physics
  useEffect(() => {
    let animFrame: number;
    const updateLoop = () => {
      frameCountRef.current++;
      setFluidPhase((prev) => (prev + (isPlaying ? 0.035 : 0.012)) % (Math.PI * 2));

      // Continuous subtle particle emission from collision points
      if (frameCountRef.current % 5 === 0) {
        // Subtle micro-fragment from collision point
        const p1 = createParticle(512, 305, false);
        particlesRef.current.push(p1);

        // Subtle fading particle from detached cell B-31 breakaway zone
        if (Math.random() > 0.4) {
          const p2 = createParticle(503, 276, false, -Math.PI * 0.75, '#60a5fa');
          particlesRef.current.push(p2);
        }
      }

      // Physics update for active particles
      const updated: CollisionParticle[] = [];
      for (const p of particlesRef.current) {
        p.life += 1;
        if (p.life < p.maxLife) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96; // 2D arena medium drag
          p.vy *= 0.96;
          p.rotation += p.rotSpeed;
          p.opacity = Math.max(0, 1 - p.life / p.maxLife);
          updated.push(p);
        }
      }

      // Cap max particles to prevent any DOM buildup
      particlesRef.current = updated.slice(-65);
      setParticles([...particlesRef.current]);

      animFrame = requestAnimationFrame(updateLoop);
    };

    animFrame = requestAnimationFrame(updateLoop);
    return () => {
      cancelAnimationFrame(animFrame);
      if (shakeTimerRef.current) cancelAnimationFrame(shakeTimerRef.current);
    };
  }, [isPlaying, createParticle]);

  // Compute stress-based color for Damage Map mode
  const getStressColor = (stress: number) => {
    if (stress < 25) return '#3b82f6'; // Low: cool blue
    if (stress < 50) return '#10b981'; // Medium-low: emerald
    if (stress < 75) return '#f59e0b'; // Medium-high: amber
    return '#ef4444'; // High/Critical: crimson
  };

  /**
   * Fallback helper to compute triangular vertices
   */
  const computeTrianglePoints = (
    cx: number,
    cy: number,
    size: number,
    rotationDeg: number
  ) => {
    const angle = (rotationDeg * Math.PI) / 180;
    const r = size * 0.57735; // Circumradius R = S / sqrt(3)
    const p1x = cx + r * Math.cos(angle);
    const p1y = cy + r * Math.sin(angle);
    const p2x = cx + r * Math.cos(angle + (2 * Math.PI) / 3);
    const p2y = cy + r * Math.sin(angle + (2 * Math.PI) / 3);
    const p3x = cx + r * Math.cos(angle + (4 * Math.PI) / 3);
    const p3y = cy + r * Math.sin(angle + (4 * Math.PI) / 3);

    return `${p1x.toFixed(2)},${p1y.toFixed(2)} ${p2x.toFixed(2)},${p2y.toFixed(2)} ${p3x.toFixed(2)},${p3y.toFixed(2)}`;
  };

  /**
   * Evaluates vertex coordinates with continuous field displacement.
   * Adjacent triangles sharing vertices deform together, guaranteeing airtight edge cohesion!
   */
  const getTrianglePointsString = (cell: TriangleCell, bot: BotData) => {
    if (!cell.vertices) {
      return computeTrianglePoints(cell.x, cell.y, cell.size, cell.rotation);
    }

    if (cell.status === 'detached' && cell.detachedVelocity) {
      const vx = cell.detachedVelocity.vx;
      const vy = cell.detachedVelocity.vy;
      const rotRad = (cell.detachedVelocity.rotV * Math.PI) / 180;
      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);
      const cx = cell.x;
      const cy = cell.y;

      return cell.vertices
        .map((v) => {
          const dx = v.x - cx;
          const dy = v.y - cy;
          const rx = dx * cos - dy * sin + cx + vx;
          const ry = dx * sin + dy * cos + cy + vy;
          return `${rx.toFixed(2)},${ry.toFixed(2)}`;
        })
        .join(' ');
    }

    // Continuous smooth space displacement field (ensures shared edges remain 100% coincident)
    return cell.vertices
      .map((v) => {
        // Organic living geometry wave
        const waveX = Math.sin(fluidPhase + v.x * 0.025 + v.y * 0.02) * 1.0;
        const waveY = Math.cos(fluidPhase * 0.85 + v.x * 0.02 + v.y * 0.025) * 0.9;

        // Subtle elastic compression at collision interface
        let compX = 0;
        let compY = 0;
        if (bot.id === 'B' && v.x < 10 && v.x > -50 && Math.abs(v.y) < 40) {
          compX = -2.5 + Math.sin(fluidPhase * 2) * 0.6;
        }
        if (bot.id === 'A' && v.x > 80) {
          compX = 1.5 + Math.sin(fluidPhase * 2.5) * 0.5;
        }

        const fx = v.x + waveX + compX;
        const fy = v.y + waveY + compY;
        return `${fx.toFixed(2)},${fy.toFixed(2)}`;
      })
      .join(' ');
  };

  /**
   * Render individual triangular module with strict adherence to visual hierarchy:
   * - Hammer: solid fill, strong thick outline
   * - Scissor: cleaner thin outline
   * - Paper: subtle dotted texture
   * - Motor: very pale fill with dashed outline
   * - Core: circular glowing marker surrounding combat triangle
   */
  const renderTriangle = (cell: TriangleCell, bot: BotData) => {
    const isSelected = selectedTriangleId === cell.id;
    const isHovered = hoveredTriangle?.id === cell.id;

    const points = getTrianglePointsString(cell, bot);

    // Styling configuration per module type
    const isWarm = bot.identity === 'warm';
    let fill = '#ffffff';
    let stroke = isWarm ? '#dc2626' : '#2563eb';
    let strokeWidth = 1.2;
    let strokeDasharray = undefined;

    if (damageMapActive) {
      fill = getStressColor(cell.stress);
      stroke = '#ffffff';
      strokeWidth = 1.5;
    } else {
      switch (cell.type) {
        case 'hammer':
          fill = isWarm ? '#dc2626' : '#2563eb';
          stroke = isWarm ? '#991b1b' : '#1d4ed8';
          strokeWidth = 2.0;
          break;

        case 'scissor':
          fill = '#ffffff';
          stroke = isWarm ? '#ea580c' : '#0d9488';
          strokeWidth = 1.2;
          break;

        case 'paper':
          fill = isWarm ? 'url(#paper-pattern-warm)' : 'url(#paper-pattern-cool)';
          stroke = isWarm ? '#d97706' : '#0284c7';
          strokeWidth = 1.2;
          break;

        case 'motor':
          fill = isWarm ? '#fef3c7' : '#e0f2fe';
          stroke = isWarm ? '#f59e0b' : '#38bdf8';
          strokeWidth = 1.2;
          strokeDasharray = '2.5 1.5';
          break;
      }
    }

    // Handle detached fading cell
    let finalOpacity = cell.opacity ?? 1;
    if (cell.id === 'B-D3-FADE') {
      fill = '#f1f5f9';
      stroke = '#cbd5e1';
      strokeWidth = 1;
      strokeDasharray = '1 2';
    }

    // Calculate core position with wave offset
    const waveX = Math.sin(fluidPhase + cell.x * 0.025 + cell.y * 0.02) * 1.0;
    const waveY = Math.cos(fluidPhase * 0.85 + cell.x * 0.02 + cell.y * 0.025) * 0.9;
    const coreX = cell.x + waveX;
    const coreY = cell.y + waveY;

    return (
      <g
        key={cell.id}
        className="cursor-pointer transition-transform duration-150 group/triangle"
        onClick={(e) => {
          e.stopPropagation();
          onSelectTriangle(cell);
          // If clicking damaged or detached cell, trigger micro-kinetic shock
          if (cell.status === 'damaged' || cell.status === 'detached') {
            emitImpactBurst('normal');
            onTriggerImpact?.('normal');
          }
        }}
        onMouseEnter={(e) => {
          setHoveredTriangle(cell);
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }
        }}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }
        }}
        onMouseLeave={() => setHoveredTriangle(null)}
      >
        {/* Core Marker: circular glowing ring surrounding combat triangle */}
        {cell.isCore && (
          <g>
            <circle
              cx={coreX}
              cy={coreY}
              r={cell.size * 1.3}
              fill="none"
              stroke={isWarm ? '#ea580c' : '#2563eb'}
              strokeWidth="2"
              strokeDasharray="4 2"
              opacity="0.8"
              className="animate-spin"
              style={{ animationDuration: '8s', transformOrigin: `${coreX}px ${coreY}px` }}
            />
            <circle
              cx={coreX}
              cy={coreY}
              r={cell.size * 0.9}
              fill={isWarm ? 'rgba(234, 88, 12, 0.18)' : 'rgba(37, 99, 235, 0.18)'}
              stroke={isWarm ? '#dc2626' : '#1d4ed8'}
              strokeWidth="1.5"
            />
            <circle
              cx={coreX}
              cy={coreY}
              r="3.5"
              fill="#ffffff"
              stroke={isWarm ? '#ea580c' : '#2563eb'}
              strokeWidth="1.2"
              className="animate-ping"
              style={{ animationDuration: '2.5s' }}
            />
          </g>
        )}

        {/* Selected or Hovered halo highlight */}
        {(isSelected || isHovered) && (
          <polygon
            points={points}
            fill="none"
            stroke="#0f172a"
            strokeWidth="3.2"
            strokeLinejoin="round"
            opacity="0.9"
          />
        )}

        {/* The Triangle Cell Shape */}
        <polygon
          points={points}
          fill={fill}
          stroke={isSelected ? '#0f172a' : stroke}
          strokeWidth={isSelected ? 2.5 : strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinejoin="round"
          opacity={finalOpacity}
          className="transition-colors duration-200"
        />

        {/* Motor thruster thrust chevron */}
        {cell.type === 'motor' && cell.status !== 'detached' && !damageMapActive && (
          <path
            d={`M ${coreX - 4} ${coreY} L ${coreX} ${coreY - 3} L ${coreX + 4} ${coreY}`}
            fill="none"
            stroke={isWarm ? '#ea580c' : '#0d9488'}
            strokeWidth="1"
            opacity="0.75"
          />
        )}

        {/* Scissor cutting bevel accent line */}
        {cell.type === 'scissor' && !damageMapActive && (
          <line
            x1={coreX - 3}
            y1={coreY - 3}
            x2={coreX + 3}
            y2={coreY + 3}
            stroke={isWarm ? '#ea580c' : '#0d9488'}
            strokeWidth="0.9"
            opacity="0.6"
          />
        )}

        {/* Damaged cell fracture line */}
        {cell.status === 'damaged' && (
          <line
            x1={coreX - 5}
            y1={coreY - 2}
            x2={coreX + 5}
            y2={coreY + 3}
            stroke="#ef4444"
            strokeWidth="1.2"
          />
        )}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-white overflow-hidden select-none flex items-center justify-center cursor-crosshair"
      onClick={() => onSelectTriangle(null)}
    >
      {/* 2D Flat Sandbox Arena SVG Viewport with Tactile Stage Displacement */}
      <svg
        viewBox="0 0 1000 620"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full transition-transform duration-75"
        style={{
          transform: `translate(${stageShake.x.toFixed(2)}px, ${stageShake.y.toFixed(2)}px) rotate(${stageShake.rot.toFixed(3)}deg)`,
        }}
      >
        <defs>
          {/* Paper Triangle subtle dotted pattern (Warm) */}
          <pattern id="paper-pattern-warm" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#fffbeb" />
            <circle cx="3" cy="3" r="0.85" fill="#d97706" opacity="0.65" />
          </pattern>

          {/* Paper Triangle subtle dotted pattern (Cool) */}
          <pattern id="paper-pattern-cool" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f0fdf4" />
            <circle cx="3" cy="3" r="0.85" fill="#0d9488" opacity="0.65" />
          </pattern>

          {/* Ultra-fine low-contrast Equilateral Triangular Grid Pattern (Side=26, W=22.52) */}
          <pattern id="arena-tri-grid" width="45.033" height="26" patternUnits="userSpaceOnUse">
            <path
              d="M 0 0 L 0 26 M 22.517 0 L 22.517 26 M 0 0 L 45.033 26 M 0 13 L 22.517 26 M 22.517 0 L 45.033 13 M 0 26 L 45.033 0 M 0 13 L 22.517 0 M 22.517 26 L 45.033 13"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="0.4"
              strokeOpacity="0.2"
            />
          </pattern>

          {/* Subtle Radial vignette to keep arena pure white in center */}
          <radialGradient id="arena-lighting" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="85%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </radialGradient>
        </defs>

        {/* Arena Pure White Background with Faint Vignette */}
        <rect width="1000" height="620" fill="url(#arena-lighting)" />

        {/* Subtle, fine-grain low-contrast triangular grid */}
        {gridActive && (
          <rect width="1000" height="620" fill="url(#arena-tri-grid)" opacity="0.85" />
        )}

        {/* Arena Boundary & Coordinates - Crisp minimal scientific aesthetic */}
        <g opacity="0.22">
          <rect
            x="40"
            y="30"
            width="920"
            height="560"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="0.8"
            strokeDasharray="4 6"
          />
          {/* Subtle Coordinate Axis center marks */}
          <line x1="500" y1="30" x2="500" y2="45" stroke="#94a3b8" strokeWidth="1" />
          <line x1="500" y1="575" x2="500" y2="590" stroke="#94a3b8" strokeWidth="1" />
          <line x1="40" y1="305" x2="55" y2="305" stroke="#94a3b8" strokeWidth="1" />
          <line x1="945" y1="305" x2="960" y2="305" stroke="#94a3b8" strokeWidth="1" />
          {/* Center Origin Crosshair */}
          <circle cx="512" cy="305" r="12" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="504" y1="305" x2="520" y2="305" stroke="#cbd5e1" strokeWidth="1" />
          <line x1="512" y1="297" x2="512" y2="313" stroke="#cbd5e1" strokeWidth="1" />
        </g>

        {/* KINETIC VECTOR OVERLAY (Optional toggleable) */}
        {vectorsActive && (
          <g opacity="0.6">
            {/* Bot A forward spear thrust vector */}
            <line x1="380" y1="305" x2="512" y2="305" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="3 2" />
            <polygon points="515,305 505,301 505,309" fill="#ea580c" />
            {/* Bot B rotational wrap vector */}
            <path
              d="M 640 220 C 580 230, 540 280, 530 330"
              fill="none"
              stroke="#2563eb"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            <polygon points="530,335 536,325 526,327" fill="#2563eb" />
          </g>
        )}

        {/* ========================================================================= */}
        {/* COLLISION REGION EFFECTS (Restrained, subtle, geometric & interactive) */}
        {/* ========================================================================= */}
        <g
          id="collision-zone"
          transform="translate(512, 305)"
          className="cursor-pointer group/collision"
          onClick={(e) => {
            e.stopPropagation();
            emitImpactBurst('heavy');
            onTriggerImpact?.('heavy');
          }}
        >
          {/* Active Impact Shockwave Rings */}
          <circle
            cx="0"
            cy="0"
            r={isImpactShaking ? "34" : "28"}
            fill="none"
            stroke="rgba(234, 88, 12, 0.35)"
            strokeWidth={isImpactShaking ? "2" : "1.2"}
            strokeDasharray="3 3"
            className="animate-ping"
            style={{ animationDuration: isImpactShaking ? '1.2s' : '3s' }}
          />
          <circle
            cx="0"
            cy="0"
            r={isImpactShaking ? "20" : "16"}
            fill="none"
            stroke="rgba(37, 99, 235, 0.45)"
            strokeWidth="1.2"
          />

          {/* Restrained geometric collision spark lines */}
          <line x1="-8" y1="-12" x2="-14" y2="-22" stroke="#dc2626" strokeWidth="1.5" />
          <line x1="4" y1="-14" x2="8" y2="-25" stroke="#f59e0b" strokeWidth="1.2" />
          <line x1="12" y1="-4" x2="22" y2="-7" stroke="#3b82f6" strokeWidth="1.2" />
          <line x1="6" y1="8" x2="16" y2="18" stroke="#10b981" strokeWidth="1.2" />
          <line x1="-6" y1="10" x2="-12" y2="18" stroke="#ea580c" strokeWidth="1.2" />

          {/* Micro contact core spark */}
          <polygon points="-2,-1 2,-1 0,-4" fill="#ea580c" opacity="0.8" />
          <polygon points="4,2 6,6 2,5" fill="#2563eb" opacity="0.8" />
          <polygon points="-5,3 -2,7 -7,6" fill="#f59e0b" opacity="0.8" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" stroke="#ef4444" strokeWidth="1.2" />
        </g>

        {/* ========================================================================= */}
        {/* BOT A — LIVING GEOMETRIC ORGANISM (SPEAR v12) - WARM IDENTITY */}
        {/* ========================================================================= */}
        <g
          id="bot-a-container"
          transform={`translate(${botA.position.x}, ${botA.position.y}) rotate(${botA.position.rotation})`}
        >
          {/* Subtle fluid boundary envelope: organic living organism feel */}
          <path
            d="M 115 0 C 95 -45, 30 -75, -45 -70 C -105 -65, -115 -25, -115 0 C -115 25, -105 65, -45 70 C 30 75, 95 45, 115 0 Z"
            fill="none"
            stroke="rgba(234, 88, 12, 0.1)"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />

          {/* Render individual triangular modules (connected edge-to-edge) */}
          {botA.modules.map((cell) => renderTriangle(cell, botA))}
        </g>

        {/* ========================================================================= */}
        {/* BOT B — LIVING GEOMETRIC ORGANISM (FLANKER v08) - COOL IDENTITY */}
        {/* ========================================================================= */}
        <g
          id="bot-b-container"
          transform={`translate(${botB.position.x}, ${botB.position.y}) rotate(${botB.position.rotation})`}
        >
          {/* Subtle fluid boundary envelope: organic crescent shape-shifting feel */}
          <path
            d="M 60 -155 C 20 -115, -25 -60, -48 -10 C -52 0, -52 10, -48 20 C -25 70, 20 125, 60 165 C 35 110, 15 50, 15 0 C 15 -50, 35 -110, 60 -155 Z"
            fill="none"
            stroke="rgba(37, 99, 235, 0.1)"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />

          {/* Render individual triangular modules (includes sheared cells & fading fragment) */}
          {botB.modules.map((cell) => renderTriangle(cell, botB))}
        </g>

        {/* ========================================================================= */}
        {/* COLLISION PARTICLES & BREAKAWAY SHARDS EMITTER LAYER */}
        {/* ========================================================================= */}
        <g id="particle-emitter-layer" className="pointer-events-none">
          {particles.map((p) => {
            if (p.type === 'triangle') {
              // Equilateral micro-triangle
              const r = p.size;
              const rad = (p.rotation * Math.PI) / 180;
              const p1x = p.x + r * Math.cos(rad);
              const p1y = p.y + r * Math.sin(rad);
              const p2x = p.x + r * Math.cos(rad + (2 * Math.PI) / 3);
              const p2y = p.y + r * Math.sin(rad + (2 * Math.PI) / 3);
              const p3x = p.x + r * Math.cos(rad + (4 * Math.PI) / 3);
              const p3y = p.y + r * Math.sin(rad + (4 * Math.PI) / 3);
              return (
                <polygon
                  key={p.id}
                  points={`${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${p3x.toFixed(1)},${p3y.toFixed(1)}`}
                  fill={p.color}
                  opacity={p.opacity}
                  stroke={p.color === '#ffffff' ? '#f59e0b' : undefined}
                  strokeWidth={p.color === '#ffffff' ? 0.6 : undefined}
                />
              );
            } else if (p.type === 'shard') {
              // Slender diamond / crystal shard
              const rad = (p.rotation * Math.PI) / 180;
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const w = p.size * 0.45;
              const h = p.size * 1.3;
              return (
                <polygon
                  key={p.id}
                  points={`
                    ${(p.x - sin * h).toFixed(1)},${(p.y + cos * h).toFixed(1)}
                    ${(p.x + cos * w).toFixed(1)},${(p.y + sin * w).toFixed(1)}
                    ${(p.x + sin * h).toFixed(1)},${(p.y - cos * h).toFixed(1)}
                    ${(p.x - cos * w).toFixed(1)},${(p.y - sin * w).toFixed(1)}
                  `}
                  fill={p.color}
                  opacity={p.opacity}
                />
              );
            } else if (p.type === 'spark') {
              // Directional kinetic friction spark
              return (
                <line
                  key={p.id}
                  x1={(p.x - p.vx * 2.5).toFixed(1)}
                  y1={(p.y - p.vy * 2.5).toFixed(1)}
                  x2={p.x.toFixed(1)}
                  y2={p.y.toFixed(1)}
                  stroke={p.color}
                  strokeWidth={Math.max(0.8, p.size * 0.35)}
                  strokeLinecap="round"
                  opacity={p.opacity}
                />
              );
            } else {
              // Micro pulverized fracture dust
              return (
                <circle
                  key={p.id}
                  cx={p.x.toFixed(1)}
                  cy={p.y.toFixed(1)}
                  r={(p.size * 0.45).toFixed(1)}
                  fill={p.color}
                  opacity={p.opacity}
                />
              );
            }
          })}
        </g>

        {/* Tactical Encounter HUD annotations */}
        <g opacity="0.8" className="font-mono text-[10px]">
          {/* Bot A Callout */}
          <text x="260" y="235" fill="#991b1b" fontWeight="600">
            ▲ SPEAR APEX [PENETRATING]
          </text>
          <line x1="330" y1="240" x2="495" y2="300" stroke="#dc2626" strokeWidth="0.8" strokeDasharray="2 2" />

          {/* Collision Point Callout with dynamic damage alert */}
          <text x="512" y="385" fill={isImpactShaking ? "#dc2626" : "#0f172a"} fontWeight="700" textAnchor="middle" className="transition-colors duration-150">
            {isImpactShaking ? "⚡ KINETIC SHIELD COMPRESSION · REGISTERING DAMAGE" : "COLLISION SHEAR ZONE · Δt 0.02s"}
          </text>
          <text x="512" y="399" fill={isImpactShaking ? "#ea580c" : "#64748b"} textAnchor="middle" className="transition-colors duration-150">
            Hammer → Scissor 2.0× Multiplier · Click to Strike
          </text>

          {/* Detached Fragment Callout */}
          <text x="680" y="210" fill="#64748b" fontWeight="500">
            ▲ B-31 DETACHED [FADING]
          </text>
          <line x1="675" y1="215" x2="520" y2="280" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="1 2" />

          {/* Bot B Exposed Core Callout */}
          <text x="730" y="360" fill="#1d4ed8" fontWeight="600">
            ● CORE EXPOSED [64% HP]
          </text>
          <line x1="725" y1="355" x2="570" y2="310" stroke="#2563eb" strokeWidth="0.8" strokeDasharray="2 2" />
        </g>
      </svg>

      {/* Floating Micro-HUD Tooltip on triangle hover */}
      {hoveredTriangle && (
        <div
          className="absolute z-20 pointer-events-none bg-neutral-900/95 backdrop-blur-md text-white rounded-lg px-3 py-2 text-xs font-mono shadow-xl border border-neutral-700 min-w-[170px]"
          style={{
            left: `${Math.min(tooltipPos.x + 15, (containerRef.current?.clientWidth || 800) - 190)}px`,
            top: `${Math.min(tooltipPos.y + 15, (containerRef.current?.clientHeight || 500) - 100)}px`,
          }}
        >
          <div className="flex items-center justify-between border-b border-neutral-700 pb-1 mb-1.5">
            <span className="font-bold text-amber-400">
              CELL #{hoveredTriangle.id}
            </span>
            <span className="text-[10px] uppercase text-neutral-400">
              {hoveredTriangle.botId === 'A' ? 'Bot A' : 'Bot B'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <span className="text-neutral-400">Type:</span>
            <span className="font-semibold capitalize text-neutral-200">
              {hoveredTriangle.type}
            </span>
            <span className="text-neutral-400">Status:</span>
            <span
              className={`font-semibold capitalize ${
                hoveredTriangle.status === 'intact'
                  ? 'text-emerald-400'
                  : hoveredTriangle.status === 'detached'
                  ? 'text-red-400'
                  : 'text-amber-400'
              }`}
            >
              {hoveredTriangle.status}
            </span>
            <span className="text-neutral-400">HP:</span>
            <span className="font-semibold text-neutral-200">{hoveredTriangle.hp}%</span>
            <span className="text-neutral-400">Stress:</span>
            <span className="font-semibold text-orange-400">{hoveredTriangle.stress}%</span>
            {hoveredTriangle.gridC !== undefined && (
              <>
                <span className="text-neutral-400">Grid:</span>
                <span className="font-semibold text-sky-400">
                  [{hoveredTriangle.gridC}, {hoveredTriangle.gridR}]
                </span>
              </>
            )}
          </div>
          {hoveredTriangle.isCore && (
            <div className="mt-1 pt-1 border-t border-red-900/60 text-[10px] text-red-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              PRIMARY VITAL CORE
            </div>
          )}
          {hoveredTriangle.status === 'detached' && (
            <div className="mt-1 pt-1 border-t border-orange-900/60 text-[10px] text-orange-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              BREAKAWAY DEBRIS SHARD
            </div>
          )}
        </div>
      )}
    </div>
  );
};
