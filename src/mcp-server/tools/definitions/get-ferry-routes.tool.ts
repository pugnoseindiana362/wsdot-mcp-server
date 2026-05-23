/**
 * @fileoverview Tool to list all WSF ferry routes operating on a given date.
 * @module mcp-server/tools/definitions/get-ferry-routes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { FerryApiService, getFerryApiService } from '@/services/ferry/ferry-service.js';

export const getFerryRoutes = tool('wsdot_get_ferry_routes', {
  title: 'Get Ferry Routes',
  description:
    'Returns all WSF ferry routes operating on a given date, including terminal ID pairs and crossing times. ' +
    'Use this to discover which routes are running and to get the terminal IDs needed for ' +
    'wsdot_get_ferry_schedule and wsdot_get_terminal_space. Route IDs also correspond to ' +
    'impactedRouteIds in ferry alerts from wsdot_get_ferry_alerts.',
  annotations: { readOnlyHint: true },
  input: z.object({
    tripDate: z
      .string()
      .optional()
      .describe(
        'Date for which to list routes, in ISO 8601 format (YYYY-MM-DD). ' +
          'Defaults to today if omitted.',
      ),
  }),
  output: z.object({
    routes: z
      .array(
        z
          .object({
            routeId: z
              .number()
              .optional()
              .describe(
                'Numeric route identifier. Corresponds to impactedRouteIds in ferry alerts.',
              ),
            routeName: z
              .string()
              .optional()
              .describe('Route name (e.g. "Seattle/Bainbridge Island").'),
            crossingTimeInMinutes: z
              .number()
              .optional()
              .describe('Typical crossing time in minutes.'),
            departingTerminalId: z
              .number()
              .optional()
              .describe('Departing terminal ID for use in schedule and space lookups.'),
            departingTerminalName: z.string().optional().describe('Departing terminal name.'),
            arrivingTerminalId: z.number().optional().describe('Arriving terminal ID.'),
            arrivingTerminalName: z.string().optional().describe('Arriving terminal name.'),
          })
          .describe('A WSF ferry route operating on the requested date.'),
      )
      .describe('Ferry routes operating on the requested date.'),
    tripDate: z.string().describe('Date for which routes were retrieved (ISO 8601).'),
    totalCount: z.number().describe('Total number of routes returned.'),
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
    {
      reason: 'invalid_date',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'The provided tripDate is not a valid ISO 8601 date.',
      recovery: 'Provide a valid date in YYYY-MM-DD format, such as 2026-05-23.',
    },
  ],

  async handler(input, ctx) {
    let ferryDate: string;
    let isoDate: string;

    if (input.tripDate?.trim()) {
      ferryDate = FerryApiService.toFerryDate(input.tripDate.trim());
      isoDate = input.tripDate.trim();
    } else {
      ferryDate = FerryApiService.todayFerryDate();
      isoDate = new Date().toISOString().slice(0, 10);
    }

    const routes = await getFerryApiService().getRoutes(ferryDate, ctx);
    ctx.log.info('Ferry routes fetched', { tripDate: ferryDate, count: routes.length });
    return { routes, tripDate: isoDate, totalCount: routes.length };
  },

  format: (result) => {
    const lines: string[] = [
      `## WSF Ferry Routes — ${result.tripDate} (${result.totalCount} routes)\n`,
    ];
    for (const r of result.routes) {
      const name = r.routeName ?? 'Unknown route';
      const crossing = r.crossingTimeInMinutes != null ? ` | ~${r.crossingTimeInMinutes} min` : '';
      lines.push(`### ${name}${crossing}`);
      if (r.departingTerminalId != null) {
        lines.push(
          `**Departing:** ${r.departingTerminalName ?? ''} (ID: ${r.departingTerminalId})`,
        );
      }
      if (r.arrivingTerminalId != null) {
        lines.push(`**Arriving:** ${r.arrivingTerminalName ?? ''} (ID: ${r.arrivingTerminalId})`);
      }
      if (r.routeId != null) lines.push(`**Route ID:** ${r.routeId}`);
      lines.push('');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
