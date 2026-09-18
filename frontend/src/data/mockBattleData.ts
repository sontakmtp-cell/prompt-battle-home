import { BotData, MatchEvent, TriangleCell } from '../types';
import { getTriangleGeometry, TriangleGeometry } from './triangularGrid';

/**
 * Generate tessellated triangular living geometric organism cells for Bot A (Spear v12).
 * Every triangle is strictly placed on the equilateral triangular grid lattice.
 * Connected triangles share edges with 100% mathematical precision.
 * 
 * Target total: 60 triangles
 * - Hammer: 18 (armored forward penetrator)
 * - Scissor: 12 (razor cutting edges on leading flanks)
 * - Paper: 15 (resilient internal mesh, including vital Core)
 * - Motor: 15 (propulsion thrusters and stabilizing fins)
 */
function createBotAModules(): TriangleCell[] {
  const modules: TriangleCell[] = [];

  interface CellDef {
    c: number;
    r: number;
    type: 'hammer' | 'scissor' | 'paper' | 'motor';
    isCore?: boolean;
    hp?: number;
    stress?: number;
  }

  const defs: CellDef[] = [];
  const add = (c: number, r: number, type: CellDef['type'], isCore = false, hp = 98, stress = 25) => {
    defs.push({ c, r, type, isCore, hp, stress });
  };

  // ==========================================
  // BOT A SPEARHEAD GEOMETRY (Facing +X)
  // ==========================================

  // Column 4 (Apex Tip - Heavy Hammer Armor)
  add(4, 0, 'hammer', false, 95, 65); // Apex strike tip (▷)

  // Column 3 (Wedge flanks & penetrator)
  add(4, -1, 'scissor', false, 98, 45); // Upper cutting blade (◁)
  add(4, 1, 'scissor', false, 98, 45);  // Lower cutting blade (◁)
  add(3, 0, 'hammer', false, 96, 58);   // Center penetrator spine (◁)
  add(3, -1, 'hammer', false, 95, 50);  // Upper penetrator wedge (▷)
  add(3, 1, 'hammer', false, 95, 50);   // Lower penetrator wedge (▷)
  add(3, -2, 'scissor', false, 100, 35);// Upper blade edge (◁)
  add(3, 2, 'scissor', false, 100, 35); // Lower blade edge (◁)

  // Column 2 (Armored wedge body)
  add(2, 0, 'hammer', false, 96, 45);   // Ridge armor (▷)
  add(2, -1, 'hammer', false, 97, 40);  // (◁)
  add(2, 1, 'hammer', false, 97, 40);   // (◁)
  add(2, -2, 'hammer', false, 98, 38);  // (▷)
  add(2, 2, 'hammer', false, 98, 38);   // (▷)
  add(2, -3, 'scissor', false, 100, 25);// (◁)
  add(2, 3, 'scissor', false, 100, 25); // (◁)

  // Column 1 (Mid-body & Core Zone)
  add(1, 0, 'paper', true, 82, 48);     // ★ THE VITAL CORE OF BOT A! (◁)
  add(1, -1, 'paper', false, 95, 30);   // Core shock absorber (▷)
  add(1, 1, 'paper', false, 95, 30);    // Core shock absorber (▷)
  add(1, -2, 'paper', false, 96, 28);   // (◁)
  add(1, 2, 'paper', false, 96, 28);    // (◁)
  add(1, -3, 'scissor', false, 100, 20);// (▷)
  add(1, 3, 'scissor', false, 100, 20); // (▷)

  // Column 0 (Central ribcage)
  add(0, 0, 'paper', false, 97, 24);    // (▷)
  add(0, -1, 'paper', false, 98, 22);   // (◁)
  add(0, 1, 'paper', false, 98, 22);    // (◁)
  add(0, -2, 'paper', false, 98, 20);   // (▷)
  add(0, 2, 'paper', false, 98, 20);    // (▷)
  add(0, -3, 'scissor', false, 100, 18);// (◁)
  add(0, 3, 'scissor', false, 100, 18); // (◁)
  add(0, -4, 'hammer', false, 98, 25);  // Lateral shield (▷)
  add(0, 4, 'hammer', false, 98, 25);   // Lateral shield (▷)

  // Column -1 (Transition & Thruster Fin base)
  add(-1, 0, 'paper', false, 98, 20);   // (◁)
  add(-1, -1, 'paper', false, 98, 20);  // (▷)
  add(-1, 1, 'paper', false, 98, 20);   // (▷)
  add(-1, -2, 'paper', false, 99, 18);  // (◁)
  add(-1, 2, 'paper', false, 99, 18);   // (◁) -> Paper complete: 15 modules
  add(-1, -3, 'scissor', false, 100, 15);// (▷)
  add(-1, 3, 'scissor', false, 100, 15); // (▷) -> Scissor complete: 12 modules
  add(-1, -4, 'hammer', false, 99, 22); // (◁)
  add(-1, 4, 'hammer', false, 99, 22);  // (◁)
  add(-1, -5, 'hammer', false, 100, 18);// (▷)
  add(-1, 5, 'hammer', false, 100, 18); // (▷)

  // Column -2 (Thruster bank)
  add(-2, 0, 'motor', false, 100, 35);  // Main centerline thruster (▷)
  add(-2, -1, 'motor', false, 100, 30); // (◁)
  add(-2, 1, 'motor', false, 100, 30);  // (◁)
  add(-2, -2, 'motor', false, 100, 28); // (▷)
  add(-2, 2, 'motor', false, 100, 28);  // (▷)
  add(-2, -3, 'motor', false, 100, 25); // (◁)
  add(-2, 3, 'motor', false, 100, 25);  // (◁)
  add(-2, -4, 'hammer', false, 100, 16);// (▷)
  add(-2, 4, 'hammer', false, 100, 16); // (▷)

  // Column -3 (Tail fins)
  add(-3, 0, 'hammer', false, 100, 15); // Tail keel armor (◁) -> Hammer complete: 18 modules
  add(-3, -1, 'motor', false, 100, 24); // (▷)
  add(-3, 1, 'motor', false, 100, 24);  // (▷)
  add(-3, -2, 'motor', false, 100, 22); // (◁)
  add(-3, 2, 'motor', false, 100, 22);  // (◁)
  add(-3, -3, 'motor', false, 100, 20); // (▷)
  add(-3, 3, 'motor', false, 100, 20);  // (▷)

  // Column -4 (Trailing nozzle)
  add(-4, -1, 'motor', false, 100, 20); // (◁)
  add(-4, 1, 'motor', false, 100, 20);  // (◁) -> Motor complete: 15 modules

  let hIdx = 1, sIdx = 1, pIdx = 1, mIdx = 1;

  defs.forEach((def) => {
    const geo = getTriangleGeometry(def.c, def.r);
    let idPrefix = 'H';
    let seq = hIdx++;
    if (def.type === 'scissor') { idPrefix = 'S'; seq = sIdx++; }
    else if (def.type === 'paper') { idPrefix = 'P'; seq = pIdx++; }
    else if (def.type === 'motor') { idPrefix = 'M'; seq = mIdx++; }

    modules.push({
      id: `A-${idPrefix}${seq}`,
      botId: 'A',
      type: def.type,
      x: geo.centroid.x,
      y: geo.centroid.y,
      rotation: geo.orientation === 'right' ? 0 : 180,
      size: geo.sideLength,
      status: 'intact',
      hp: def.hp ?? 98,
      stress: def.stress ?? 25,
      isCore: !!def.isCore,
      gridC: def.c,
      gridR: def.r,
      vertices: geo.vertices,
      points: geo.pointsString,
    });
  });

  return modules;
}

/**
 * Generate triangular living geometric organism cells for Bot B (Flanker v08).
 * Exactly constructed on the equilateral triangular grid lattice.
 * Bot B is a curved crescent flanker bending and rotating around the attack.
 * 
 * Target total: 60 triangles
 * - Hammer: 14
 * - Scissor: 20
 * - Paper: 12 (including Core)
 * - Motor: 14
 */
function createBotBModules(): TriangleCell[] {
  const modules: TriangleCell[] = [];

  interface CellDef {
    c: number;
    r: number;
    type: 'hammer' | 'scissor' | 'paper' | 'motor';
    isCore?: boolean;
    hp?: number;
    stress?: number;
    status?: 'intact' | 'stressed' | 'damaged' | 'detached';
    detachedVelocity?: { vx: number; vy: number; rotV: number };
    opacity?: number;
    customId?: string;
  }

  const defs: CellDef[] = [];
  const add = (
    c: number,
    r: number,
    type: CellDef['type'],
    isCore = false,
    hp = 95,
    stress = 30,
    status: CellDef['status'] = 'intact',
    extra?: Partial<CellDef>
  ) => {
    defs.push({ c, r, type, isCore, hp, stress, status, ...extra });
  };

  // ==========================================
  // BOT B CRESCENT GEOMETRY (Facing -X)
  // ==========================================

  // Center / Impact belly (Hammer armor absorbing shock & Paper core cushioning)
  add(0, 0, 'paper', true, 64, 88, 'stressed');  // ★ THE VITAL CORE OF BOT B! (▷)
  add(0, -1, 'paper', false, 70, 75, 'stressed'); // (◁)
  add(0, 1, 'paper', false, 82, 50, 'intact');    // (◁)
  add(0, -2, 'hammer', false, 65, 80, 'stressed');// (▷) Impact zone
  add(0, 2, 'hammer', false, 88, 42, 'intact');   // (▷) Lower impact

  // Forward impact face (Column -1, directly facing spearhead attack)
  add(-1, 0, 'hammer', false, 35, 96, 'damaged');  // (◁) Impact direct contact point
  add(-1, -1, 'hammer', false, 45, 92, 'damaged'); // (▷) Impact shear zone
  add(-1, 1, 'hammer', false, 60, 85, 'stressed'); // (▷) Lower impact shear
  add(-1, -2, 'hammer', false, 72, 70, 'stressed');// (◁)
  add(-1, 2, 'hammer', false, 90, 38, 'intact');   // (◁)

  // Sheared debris point at collision interface
  // Cell B-31: forward sheared scissor cell broken away from body!
  add(-2, -1, 'scissor', false, 0, 100, 'detached', {
    customId: 'B-31',
    opacity: 0.65,
    detachedVelocity: { vx: -22, vy: -16, rotV: 5.5 },
  });
  add(-2, 0, 'hammer', false, 55, 88, 'damaged');   // (▷) Front defensive edge
  add(-2, 1, 'hammer', false, 78, 65, 'intact');    // (◁)

  // Inner core cushion (Column 1)
  add(1, 0, 'paper', false, 85, 45, 'intact');     // (◁)
  add(1, -1, 'paper', false, 82, 52, 'intact');    // (▷)
  add(1, 1, 'paper', false, 92, 32, 'intact');     // (▷)
  add(1, -2, 'paper', false, 88, 40, 'intact');    // (◁)
  add(1, 2, 'paper', false, 94, 25, 'intact');     // (◁)
  add(1, -3, 'hammer', false, 86, 45, 'intact');   // (▷)
  add(1, 3, 'hammer', false, 95, 25, 'intact');    // (▷)

  // Column 2 (Inner crescent spine)
  add(2, 0, 'paper', false, 92, 30, 'intact');     // (▷)
  add(2, -1, 'paper', false, 90, 35, 'intact');    // (◁)
  add(2, 1, 'paper', false, 96, 20, 'intact');     // (◁)
  add(2, -2, 'paper', false, 94, 25, 'intact');    // (▷) -> Paper complete: 12 modules
  add(2, -3, 'hammer', false, 90, 35, 'intact');   // (◁)
  add(2, 3, 'hammer', false, 98, 18, 'intact');    // (◁) -> Hammer complete: 14 modules

  // Upper Horn (Scissors along cutting crescent arc)
  add(0, -3, 'scissor', false, 80, 55, 'intact');  // (◁)
  add(-1, -3, 'scissor', false, 75, 62, 'intact'); // (▷)
  add(-1, -4, 'scissor', false, 85, 48, 'intact'); // (◁)
  add(0, -4, 'scissor', false, 88, 40, 'intact');  // (▷)
  add(1, -4, 'scissor', false, 90, 35, 'intact');  // (◁)
  add(2, -4, 'scissor', false, 92, 30, 'intact');  // (▷)
  add(1, -5, 'scissor', false, 94, 25, 'intact');  // (▷)
  add(2, -5, 'scissor', false, 95, 22, 'intact');  // (◁)
  add(0, -5, 'scissor', false, 96, 20, 'intact');  // (◁)
  add(-1, -5, 'scissor', false, 98, 18, 'intact'); // (▷)

  // Upper Thruster Motors
  add(3, -1, 'motor', false, 92, 45, 'intact');    // (▷)
  add(3, -2, 'motor', false, 88, 52, 'intact');    // (◁)
  add(3, -3, 'motor', false, 85, 60, 'intact');    // (▷)
  add(3, -4, 'motor', false, 75, 70, 'damaged');   // (◁) B-M4 damaged by shear
  add(2, -6, 'motor', false, 94, 30, 'intact');    // (▷)
  add(1, -6, 'motor', false, 95, 25, 'intact');    // (◁)
  add(3, 0, 'motor', false, 92, 35, 'intact');     // (◁) Spine thruster

  // Lower Horn (Scissors along lower cutting arc)
  add(0, 3, 'scissor', false, 92, 28, 'intact');   // (◁)
  add(-1, 3, 'scissor', false, 94, 25, 'intact');  // (▷)
  add(-1, 4, 'scissor', false, 96, 22, 'intact');  // (◁)
  add(0, 4, 'scissor', false, 96, 20, 'intact');   // (▷)
  add(1, 4, 'scissor', false, 98, 18, 'intact');   // (◁)
  add(2, 4, 'scissor', false, 98, 16, 'intact');   // (▷)
  add(1, 5, 'scissor', false, 99, 15, 'intact');   // (▷)
  add(2, 5, 'scissor', false, 99, 14, 'intact');   // (◁)
  add(0, 5, 'scissor', false, 100, 12, 'intact');  // (◁)
  add(-1, 5, 'scissor', false, 100, 10, 'intact'); // (▷) -> Scissor complete: 20 modules

  // Lower Thruster Motors
  add(3, 1, 'motor', false, 96, 25, 'intact');     // (▷)
  add(3, 2, 'motor', false, 96, 25, 'intact');     // (◁)
  add(3, 3, 'motor', false, 98, 20, 'intact');     // (▷)
  add(3, 4, 'motor', false, 98, 18, 'intact');     // (◁)
  add(2, 6, 'motor', false, 100, 15, 'intact');    // (▷)
  add(1, 6, 'motor', false, 100, 15, 'intact');    // (◁)
  add(4, 0, 'motor', false, 98, 20, 'intact');     // (▷) Rear tail motor -> Motor complete: 14 modules

  let hIdx = 1, sIdx = 1, pIdx = 1, mIdx = 1;

  defs.forEach((def) => {
    const geo = getTriangleGeometry(def.c, def.r);
    let idPrefix = 'H';
    let seq = hIdx++;
    if (def.type === 'scissor') { idPrefix = 'S'; seq = sIdx++; }
    else if (def.type === 'paper') { idPrefix = 'P'; seq = pIdx++; }
    else if (def.type === 'motor') { idPrefix = 'M'; seq = mIdx++; }

    const id = def.customId || `B-${idPrefix}${seq}`;

    modules.push({
      id,
      botId: 'B',
      type: def.type,
      x: geo.centroid.x,
      y: geo.centroid.y,
      rotation: geo.orientation === 'right' ? 0 : 180,
      size: geo.sideLength,
      status: def.status || 'intact',
      hp: def.hp || 95,
      stress: def.stress || 30,
      isCore: !!def.isCore,
      gridC: def.c,
      gridR: def.r,
      vertices: geo.vertices,
      points: geo.pointsString,
      detachedVelocity: def.detachedVelocity,
      opacity: def.opacity,
    });
  });

  // Additional floating collision debris fragments along the exact triangle geometry
  // Detached fragment fading into pale gray as requested:
  const debrisGeo = getTriangleGeometry(-3, -1);
  modules.push({
    id: 'B-D3-FADE',
    botId: 'B',
    type: 'paper',
    x: debrisGeo.centroid.x,
    y: debrisGeo.centroid.y,
    rotation: 180,
    size: debrisGeo.sideLength,
    status: 'detached',
    hp: 0,
    stress: 100,
    opacity: 0.22, // Fading into pale gray!
    detachedVelocity: { vx: -48, vy: -32, rotV: 9.5 },
    gridC: -3,
    gridR: -1,
    vertices: debrisGeo.vertices,
    points: debrisGeo.pointsString,
  });

  return modules;
}

export const INITIAL_BOT_A: BotData = {
  id: 'A',
  name: 'SPEAR v12',
  version: '12.4.1',
  identity: 'warm',
  themeColors: {
    primary: '#dc2626', // Crimson Red
    secondary: '#ea580c', // Vivid Orange
    accent: '#d97706', // Warm Gold
    pale: '#fef3c7', // Pale Amber
    border: '#991b1b', // Deep Crimson stroke
    coreGlow: 'rgba(234, 88, 12, 0.45)',
  },
  totalTriangles: 60,
  activeTriangles: 60,
  coreHp: 82,
  mobility: 100,
  loadFactor: 1.00,
  triangleCounts: {
    hammer: 18,
    scissor: 12,
    paper: 15,
    motor: 15,
  },
  activeMotorCount: 15,
  totalMotorCount: 15,
  tacticalBrain: {
    title: 'Brain',
    directive: 'Aggressive · Direct Assault',
    promptSnippet: 'Target enemy core vector [320, 180]; initiate hammer wedge thrust at max velocity; overload rear motors; lock scissor cutting flanks to counter flanking crescent.',
  },
  position: { x: 400, y: 305, rotation: 0 },
  modules: createBotAModules(),
};

export const INITIAL_BOT_B: BotData = {
  id: 'B',
  name: 'FLANKER v08',
  version: '8.2.0',
  identity: 'cool',
  themeColors: {
    primary: '#2563eb', // Cobalt Blue
    secondary: '#0d9488', // Deep Teal
    accent: '#10b981', // Cool Emerald
    pale: '#e0f2fe', // Pale Cyan
    border: '#1e40af', // Deep Cobalt stroke
    coreGlow: 'rgba(37, 99, 235, 0.5)',
  },
  totalTriangles: 60,
  activeTriangles: 52,
  coreHp: 64, // Exposed & damaged
  mobility: 74,
  loadFactor: 1.18,
  triangleCounts: {
    hammer: 14,
    scissor: 20,
    paper: 12,
    motor: 14,
  },
  activeMotorCount: 11,
  totalMotorCount: 14,
  tacticalBrain: {
    title: 'Brain',
    directive: 'Adaptive · Crescent Flank',
    promptSnippet: 'Encircle attacking spear; isolate trailing motor modules; sweep with scissor sickle; maintain distance > 120px from hammer apex.',
  },
  position: { x: 555, y: 305, rotation: 0 },
  modules: createBotBModules(),
};

export const MATCH_EVENTS: MatchEvent[] = [
  {
    id: 'evt-1',
    timestamp: '00:35',
    timeSec: 35,
    title: 'Kinetic convergence',
    description: 'Bot A initiated direct spear thrust at 142 px/s',
    type: 'thrust',
    bot: 'A',
  },
  {
    id: 'evt-2',
    timestamp: '00:38',
    timeSec: 38,
    title: 'Crescent wrap attempted',
    description: 'Bot B scissor wing rotated -42° to enclose spear apex',
    type: 'counter',
    bot: 'B',
  },
  {
    id: 'evt-3',
    timestamp: '00:41',
    timeSec: 41,
    title: 'Motor cluster damaged',
    description: 'Trailing port thrusters B-M4 took 60% shear force',
    type: 'motor',
    bot: 'B',
    critical: true,
  },
  {
    id: 'evt-4',
    timestamp: '00:42',
    timeSec: 42,
    title: 'Bot B overloaded',
    description: 'Lateral elasticity exceeded load factor threshold (1.18)',
    type: 'overload',
    bot: 'B',
    critical: true,
  },
  {
    id: 'evt-5',
    timestamp: '00:44',
    timeSec: 44,
    title: 'Hammer → Scissor ×2.0',
    description: 'Apex hammer A-H1 struck cutting scissor B-31 with critical multiplier',
    type: 'counter',
    bot: 'A',
    critical: true,
  },
  {
    id: 'evt-6',
    timestamp: '00:45',
    timeSec: 45,
    title: 'Triangle B-31 destroyed',
    description: 'Forward scissor cell sheared away into arena debris',
    type: 'destroyed',
    bot: 'B',
    critical: true,
  },
  {
    id: 'evt-7',
    timestamp: '00:46',
    timeSec: 46,
    title: 'Core exposed',
    description: 'Bot B internal defensive paper mesh breached; core HP dropped to 64%',
    type: 'core',
    bot: 'B',
    critical: true,
  },
];
