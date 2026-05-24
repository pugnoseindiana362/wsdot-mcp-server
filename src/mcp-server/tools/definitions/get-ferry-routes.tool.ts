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
    'Returns all WSF ferry routes operating on a given date. ' +
    'Route IDs correspond to impactedRouteIds in ferry alerts from wsdot_get_ferry_alerts. ' +
    'To get terminal IDs for schedule and space lookups, use wsdot_get_ferry_terminals.',
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
            routeAbbrev: z
              .string()
              .optional()
              .describe('Short route abbreviation (e.g. "SEA-BBI").'),
            description: z
              .string()
              .optional()
              .describe('Full route description (e.g. "Seattle/Bainbridge Island").'),
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
    const tripDate = input.tripDate?.trim()
      ? FerryApiService.toFerryDate(input.tripDate.trim())
      : FerryApiService.todayFerryDate();

    const routes = await getFerryApiService().getRoutes(tripDate, ctx);
    ctx.log.info('Ferry routes fetched', { tripDate, count: routes.length });
    return { routes, tripDate, totalCount: routes.length };
  },

  format: (result) => {
    const lines: string[] = [
      `## WSF Ferry Routes — ${result.tripDate} (${result.totalCount} routes)\n`,
    ];
    for (const r of result.routes) {
      const name = r.description ?? r.routeAbbrev ?? 'Unknown route';
      lines.push(`### ${name}`);
      if (r.routeAbbrev != null) lines.push(`**Abbrev:** ${r.routeAbbrev}`);
      if (r.routeId != null) lines.push(`**Route ID:** ${r.routeId}`);
      lines.push('');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
