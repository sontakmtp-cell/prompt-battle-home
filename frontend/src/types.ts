export type TriangleType = 'hammer' | 'scissor' | 'paper' | 'motor';

export type TriangleStatus = 'intact' | 'stressed' | 'damaged' | 'detached';

export interface TriangleCell {
  id: string;
  botId: 'A' | 'B';
  type: TriangleType;
  /** Relative or arena coordinates */
  x: number;
  y: number;
  rotation: number; // in degrees
  size: number;
  status: TriangleStatus;
  hp: number; // 0 - 100
  stress: number; // 0 - 100
  isCore?: boolean;
  detachedVelocity?: { vx: number; vy: number; rotV: number };
  opacity?: number;
  /** Exact discrete triangular grid coordinates */
  gridC?: number;
  gridR?: number;
  vertices?: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  points?: string;
}

export interface BotData {
  id: 'A' | 'B';
  name: string;
  version: string;
  identity: 'warm' | 'cool';
  themeColors: {
    primary: string;
    secondary: string;
    accent: string;
    pale: string;
    border: string;
    coreGlow: string;
  };
  totalTriangles: number;
  activeTriangles: number;
  coreHp: number; // percentage
  mobility: number; // percentage
  loadFactor: number;
  triangleCounts: {
    hammer: number;
    scissor: number;
    paper: number;
    motor: number;
  };
  activeMotorCount: number;
  totalMotorCount: number;
  tacticalBrain: {
    title: string;
    directive: string;
    promptSnippet: string;
  };
  modules: TriangleCell[];
  position: { x: number; y: number; rotation: number };
}

export interface MatchEvent {
  id: string;
  timestamp: string; // "00:41"
  timeSec: number;
  title: string;
  description: string;
  type: 'motor' | 'overload' | 'counter' | 'destroyed' | 'core' | 'thrust';
  bot?: 'A' | 'B';
  critical?: boolean;
}
