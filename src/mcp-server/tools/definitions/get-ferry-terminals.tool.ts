/**
 * @fileoverview Tool to list all WSF ferry terminals with their numeric IDs.
 * @module mcp-server/tools/definitions/get-ferry-terminals.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFerryApiService } from '@/services/ferry/ferry-service.js';

export const getFerryTerminals = tool('wsdot_get_ferry_terminals', {
  title: 'Get Ferry Terminals',
  description:
    'Returns all WSF ferry terminals with their numeric IDs, names, and abbreviations. ' +
    'Call this first to resolve human-readable terminal names (e.g. "Bainbridge Island", ' +
    '"Seattle", "Kingston") to the numeric terminal IDs required by the schedule and space tools. ' +
    'The terminal list is small (~22 terminals) and rarely changes.',
  annotations: { readOnlyHint: true },
  input: z.object({}),
  output: z.object({
    terminals: z
      .array(
        z
          .object({
            terminalId: z
              .number()
              .describe('Numeric terminal ID used in schedule and space API calls.'),
            terminalName: z.string().describe('Full terminal name (e.g. "Bainbridge Island").'),
            terminalAbbrev: z.string().optional().describe('Short abbreviation (e.g. "BI").'),
            latitude: z.number().optional().describe('Terminal latitude.'),
            longitude: z.number().optional().describe('Terminal longitude.'),
          })
          .describe('A WSF ferry terminal with its ID and location.'),
      )
      .describe('All WSF ferry terminals.'),
    totalCount: z.number().describe('Total number of terminals.'),
  }),

  errors: [
    {
      reason: 'api_unavailable',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'WSF Ferry API is unreachable or returns a non-2xx response after retries.',
      retryable: true,
      recovery:
        'Retry in 30 seconds. If the issue persists, check wsdot.wa.gov/ferries for service status.',
    },
  ],

  async handler(_input, ctx) {
    const terminals = await getFerryApiService().getTerminals(ctx);
    ctx.log.info('Ferry terminals fetched', { count: terminals.length });
    return { terminals, totalCount: terminals.length };
  },

  format: (result) => {
    const lines: string[] = [`## WSF Ferry Terminals (${result.totalCount})\n`];
    for (const t of result.terminals) {
      const abbrev = t.terminalAbbrev ? ` (${t.terminalAbbrev})` : '';
      const coords =
        t.latitude != null && t.longitude != null ? ` | ${t.latitude}, ${t.longitude}` : '';
      lines.push(`- **${t.terminalName}**${abbrev} — ID: ${t.terminalId}${coords}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
