// One-off generator: emits the 64-direction unit-vector table as integer literals.
// Scale 1e6. Hardcoded at runtime so no float trig ever runs inside the simulation.
const fs = require('fs');
const S = 1000000;
const rows = [];
for (let k = 0; k < 64; k++) {
  const a = (k * 2 * Math.PI) / 64;
  const c = Math.round(Math.cos(a) * S);
  const s = Math.round(Math.sin(a) * S);
  const deg = (k * 5.625).toFixed(3);
  rows.push('  [' + c + ', ' + s + '], // ' + k + ' : ' + deg + ' deg');
}
const out = [
  '/**',
  ' * 64-direction unit-vector table, scale 1e6.',
  ' * Index 0 = +x, index increases clockwise on screen (the y axis points down).',
  ' * Generated once by tools/gen-rot64.cjs and frozen as literals so that the',
  ' * simulation never calls Math.cos / Math.sin at runtime (cross-platform determinism).',
  ' */',
  'export const ROT_SCALE = 1000000;',
  'export const ROT64: readonly (readonly [number, number])[] = [',
  rows.join('\n'),
  '];',
  '',
].join('\n');
fs.writeFileSync('packages/contracts/src/rot64.ts', out);
console.log('written ' + rows.length + ' entries');
