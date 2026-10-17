import { Rpc } from '@opencode/plugin/rpc';

export const misconfiguredMessage = 'Chi mentions inactive: set the server plugin options.endpoint to an explicit HTTP(S) Chi endpoint without credentials, query or fragment.';
const statusSchema = {
  type: 'object', additionalProperties: false, required: ['state', 'reason', 'message'],
  properties: {
    state: { type: 'string', enum: ['ready', 'inactive'] },
    reason: { type: 'string', enum: ['configured', 'missing-endpoint', 'invalid-endpoint'] },
    message: { type: 'string' },
  },
};

export const Participants = Rpc.define({
  id: 'chi.participants',
  events: {},
  methods: {
    status: {
      input: { type: 'object', properties: {}, additionalProperties: false },
      output: statusSchema,
    },
    complete: {
      input: { type: 'object', properties: { query: { type: 'string', maxLength: 256 } }, required: ['query'], additionalProperties: false },
      output: { type: 'array', maxItems: 100, items: {
        type: 'object', required: ['id', 'value', 'description', 'data'], additionalProperties: false,
        properties: { id: { type: 'string' }, value: { type: 'string' }, description: { type: 'string' }, data: {
          type: 'object', required: ['ownerId', 'handle', 'actor', 'repo', 'endpoint'], additionalProperties: false,
          properties: Object.fromEntries(['ownerId', 'handle', 'actor', 'repo', 'endpoint'].map(key => [key, { type: 'string' }])),
        } },
      } },
      errors: { unavailable: { type: 'object', additionalProperties: false }, misconfigured: statusSchema },
    },
  },
});
