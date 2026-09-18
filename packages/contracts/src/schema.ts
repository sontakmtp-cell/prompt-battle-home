import { BRAIN_API_VERSION, BOT_SCHEMA_VERSION, REPLAY_VERSION } from './versions.js';
import {
  BRAIN_MOVE_COMMANDS,
  BRAIN_OPS,
  BRAIN_ROTATE_COMMANDS,
} from './brain.js';

const TRI_TYPES = ['hammer', 'scissor', 'paper', 'motor'];
const ORIENTATIONS = ['up', 'down'];

const operandSchema = {
  oneOf: [
    { type: 'integer' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['field'],
      properties: { field: { type: 'string' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['var'],
      properties: { var: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]{0,15}$' } },
    },
  ],
};

/** Recursive condition schema: all / any / not / cmp. */
const conditionSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  oneOf: [
    { required: ['all'], properties: { all: { type: 'array', items: { $ref: '#/$defs/condition' }, minItems: 1 } } },
    { required: ['any'], properties: { any: { type: 'array', items: { $ref: '#/$defs/condition' }, minItems: 1 } } },
    { required: ['not'], properties: { not: { $ref: '#/$defs/condition' } } },
    {
      required: ['cmp'],
      properties: {
        cmp: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: [{ enum: BRAIN_OPS as unknown as string[] }, operandSchema, operandSchema],
        },
      },
    },
  ],
};

export const brainSchema = {
  $id: 'https://promptchien.dev/schema/brain.json',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'rules'],
  properties: {
    version: { type: 'integer', minimum: 1, maximum: BRAIN_API_VERSION },
    rules: {
      type: 'array',
      minItems: 1,
      maxItems: 128,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          when: { $ref: '#/$defs/condition' },
          set: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['var', 'value'],
              properties: {
                var: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]{0,15}$' },
                value: operandSchema,
              },
            },
          },
          move: { enum: BRAIN_MOVE_COMMANDS as unknown as string[] },
          rotate: { enum: BRAIN_ROTATE_COMMANDS as unknown as string[] },
        },
      },
    },
  },
  $defs: { condition: conditionSchema },
};

export const botSchema = {
  $id: 'https://promptchien.dev/schema/bot.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'name', 'triangles', 'coreIndex', 'brain'],
  properties: {
    schemaVersion: { type: 'integer', minimum: 1, maximum: BOT_SCHEMA_VERSION },
    name: { type: 'string', minLength: 1, maxLength: 48 },
    triangles: {
      type: 'array',
      minItems: 1,
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['r', 'j', 'o', 'type'],
        properties: {
          r: { type: 'integer', minimum: -64, maximum: 64 },
          j: { type: 'integer', minimum: -64, maximum: 64 },
          o: { enum: ORIENTATIONS },
          type: { enum: TRI_TYPES },
        },
      },
    },
    coreIndex: { type: 'integer', minimum: 0 },
    brain: { $ref: 'https://promptchien.dev/schema/brain.json' },
  },
};

export const replayManifestSchema = {
  $id: 'https://promptchien.dev/schema/replay.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'matchId',
    'seed',
    'engineVersion',
    'rulesetVersion',
    'tickRate',
    'totalTicks',
    'maxTicks',
    'checkpointEveryTicks',
    'botA',
    'botB',
    'outcome',
    'replayHash',
  ],
  properties: {
    version: { type: 'integer', minimum: 1, maximum: REPLAY_VERSION },
    matchId: { type: 'string' },
    seed: { type: 'integer' },
    engineVersion: { type: 'string' },
    rulesetVersion: { type: 'string' },
    tickRate: { type: 'integer' },
    totalTicks: { type: 'integer' },
    maxTicks: { type: 'integer' },
    checkpointEveryTicks: { type: 'integer' },
    startPoses: { type: 'object' },
    botA: { type: 'object' },
    botB: { type: 'object' },
    outcome: { type: 'object' },
    replayHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
};

export const SCHEMAS: Record<string, unknown> = {
  'bot.json': botSchema,
  'brain.json': brainSchema,
  'replay.json': replayManifestSchema,
};
