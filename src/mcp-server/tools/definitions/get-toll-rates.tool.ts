/**
 * @fileoverview Tool to fetch current dynamic toll rates from the WSDOT Traffic API.
 * @module mcp-server/tools/definitions/get-toll-rates.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTrafficApiService } from '@/services/traffic/traffic-service.js';

export const getTollRates = tool('wsdot_get_toll_rates', {
  title: 'Get Toll Rates',
  description:
    'Returns current dynamic toll rates for WA express lanes and tolled facilities: SR 99 (WSDOT Tunnel), ' +
    'SR 520 Bridge, I-405 Express Lanes, I-90 Two-Way Express Lanes, and SR 167 HOT Lanes. ' +
    'Rates are time-banded and change dynamically based on traffic conditions.',
  annotations: { readOnlyHint: true },
  input: z.object({}),
  output: z.object({
    rates: z
      .array(
        z
          .object({
            tripName: z.string().optional().describe('Name of the tolled trip or lane segment.'),
            stateRoute: z.string().optional().describe('State route number.'),
            startMilepost: z.number().optional().describe('Starting milepost of the toll segment.'),
            endMilepost: z.number().optional().describe('Ending milepost of the toll segment.'),
            tollRateInDollars: z.number().optional().describe('Current toll rate in US dollars.'),
            message: z.string().optional().describe('Dynamic message shown on toll sign.'),
            signText: z.string().optional().describe('Text displayed on the toll rate sign.'),
            startLocationName: z
              .string()
              .optional()
              .describe('Human-readable start location name.'),
            endLocationName: z.string().optional().describe('Human-readable end location name.'),
            timeUpdated: z.string().optional().describe('When this toll rate was last updated.'),
            tollCondition: z.number().optional().describe('Numeric toll condition code.'),
          })
          .describe('Current toll rate for one segment or trip.'),
      )
      .describe('Current toll rates for all active tolled facilities.'),
  }),

  enrichment: {
    totalCount: z.number().describe('Total number of toll rate entries returned.'),
    notice: z
      .string()
      .optional()
      .describe('Optional notice when no toll rate data is available. Absent on normal results.'),
  },

  errors: [
    {
      reason: 'api_unavailable',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'WSDOT Traffic API is unreachable or returns a non-2xx response after retries.',
      retryable: true,
      recovery:
        'Retry in 30 seconds. If the issue persists, check wsdot.wa.gov for service status.',
    },
  ],

  async handler(_input, ctx) {
    const rates = await getTrafficApiService().getTollRates(ctx);
    ctx.log.info('Toll rates fetched', { count: rates.length });

    ctx.enrich({ totalCount: rates.length });
    if (rates.length === 0) {
      ctx.enrich.notice(
        'No toll rate data available. The WSDOT API may be temporarily unavailable — retry in 30 seconds.',
      );
    }

    return { rates };
  },

  format: (result) => {
    if (result.rates.length === 0) {
      return [{ type: 'text', text: 'No toll rate data available.' }];
    }
    const lines: string[] = [];
    for (const r of result.rates) {
      const name = r.tripName ?? r.signText ?? 'Toll segment';
      lines.push(`### ${name}`);
      if (r.stateRoute) lines.push(`**Route:** SR ${r.stateRoute}`);
      if (r.startLocationName || r.endLocationName) {
        const seg = [r.startLocationName, r.endLocationName].filter(Boolean).join(' → ');
        lines.push(`**Segment:** ${seg}`);
      }
      if (r.startMilepost != null) lines.push(`**Start MP:** ${r.startMilepost}`);
      if (r.endMilepost != null) lines.push(`**End MP:** ${r.endMilepost}`);
      if (r.signText) lines.push(`**Sign:** ${r.signText}`);
      if (r.tollRateInDollars != null) lines.push(`**Rate:** $${r.tollRateInDollars.toFixed(2)}`);
      if (r.message) lines.push(`**Message:** ${r.message}`);
      if (r.timeUpdated) lines.push(`**Updated:** ${r.timeUpdated}`);
      if (r.tollCondition != null) lines.push(`**Condition:** ${r.tollCondition}`);
      lines.push('');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
