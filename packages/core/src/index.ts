/**
 * @promptchien/core
 *
 * Module boundaries (PLAN.md section 1). The engine receives data and returns
 * results: it never touches the database, the network or the interface.
 *
 *   geometry/   triangular lattice, body construction, shape validation
 *   brain/      command-set validation and the bounded interpreter
 *   engine/     collision + the nine-step tick loop
 *   replay/     hashing and independent verification
 *   bot/        package locking
 *   sandbox/    pre-match proving ground
 *   validation/ the full validate pipeline
 *   balance/    the measurement harness
 *   bots/       the five reference bots
 */
export * from './math/fixed.js';
export * from './geometry/lattice.js';
export * from './geometry/build.js';
export * from './geometry/validator.js';
export * from './brain/validate.js';
export * from './brain/interpreter.js';
export * from './engine/collision.js';
export * from './engine/simulate.js';
export * from './replay/hash.js';
export * from './replay/verify.js';
export * from './bot/package.js';
export * from './sandbox/run.js';
export * from './validation/validate.js';
export * from './bots/samples.js';
export * from './balance/harness.js';
