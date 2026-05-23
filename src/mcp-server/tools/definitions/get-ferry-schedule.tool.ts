/**
 * @fileoverview Tool to fetch departure times for a specific WSF ferry route.
 * @module mcp-server/tools/definitions/get-ferry-schedule.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { FerryApiService, getFerryApiService } from '@/services/ferry/ferry-service.js';

export const getFerrySchedule = tool('wsdot_get_ferry_schedule', {
  title: 'Get Ferry Schedule',
  description:
    'Returns departure times for a specific WSF ferry route on a given date. ' +
    'Requires numeric terminal IDs — use wsdot_get_ferry_terminals to resolve terminal names to IDs. ' +
    'Set remainingOnly to true to show only future departures for today (useful for "next ferry" queries). ' +
    'For future dates, all sailings for that day are returned.',
  annotations: { readOnlyHint: true },
  input: z.object({
    departingTerminalId: z
      .number()
      .describe(
        'Numeric ID of the departing terminal. Use wsdot_get_ferry_terminals to look up terminal IDs.',
      ),
    arrivingTerminalId: z.number().describe('Numeric ID of the arriving terminal.'),
    tripDate: z
      .string()
      .optional()
      .describe('Date in ISO 8601 format (YYYY-MM-DD). Defaults to today if omitted.'),
    remainingOnly: z
      .boolean()
      .optional()
      .describe(
        'When true, returns only future sailings for today. Ignored for future dates. Default: false.',
      ),
  }),
  output: z.object({
    routeName: z.string().optional().describe('Name of the ferry route.'),
    departingTerminalName: z.string().optional().describe('Departing terminal name.'),
    arrivingTerminalName: z.string().optional().describe('Arriving terminal name.'),
    tripDate: z.string().describe('Date of the schedule (ISO 8601).'),
    remainingOnly: z.boolean().describe('Whether the result shows only remaining sailings.'),
    sailings: z
      .array(
        z
          .object({
            departureTime: z.string().optional().describe('Scheduled departure time.'),
            arrivalTime: z.string().optional().describe('Scheduled arrival time.'),
            isCancelled: z.boolean().optional().describe('Whether this sailing is cancelled.'),
            vesselName: z.string().optional().describe('Vessel assigned to this sailing.'),
          })
          .describe('One scheduled sailing with departure time and vessel assignment.'),
      )
      .describe('Scheduled sailings for this route and date.'),
    totalSailings: z.number().describe('Total number of sailings returned.'),
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
      reason: 'invalid_terminal_pair',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'The terminal ID pair is invalid or does not form a valid ferry route.',
      recovery:
        'Use wsdot_get_ferry_terminals to list valid terminal IDs and wsdot_get_ferry_routes to find valid pairs.',
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

    const remainingOnly = input.remainingOnly ?? false;
    const schedule = await getFerryApiService().getSchedule(
      input.departingTerminalId,
      input.arrivingTerminalId,
      ferryDate,
      remainingOnly,
      ctx,
    );

    ctx.log.info('Ferry schedule fetched', {
      departingTerminalId: input.departingTerminalId,
      arrivingTerminalId: input.arrivingTerminalId,
      tripDate: ferryDate,
      sailingsCount: schedule.sailings.length,
    });

    return {
      routeName: schedule.routeName,
      departingTerminalName: schedule.departingTerminalName,
      arrivingTerminalName: schedule.arrivingTerminalName,
      tripDate: isoDate,
      remainingOnly,
      sailings: schedule.sailings,
      totalSailings: schedule.sailings.length,
    };
  },

  format: (result) => {
    const route = result.routeName ?? 'Unknown Route';
    const remainingNote = result.remainingOnly ? ' (remaining today)' : '';
    const lines: string[] = [
      `## Ferry Schedule — ${route}`,
      `**Date:** ${result.tripDate}${remainingNote} | **Sailings:** ${result.totalSailings}`,
    ];
    if (result.departingTerminalName) lines.push(`**From:** ${result.departingTerminalName}`);
    if (result.arrivingTerminalName) lines.push(`**To:** ${result.arrivingTerminalName}`);
    lines.push('');

    if (result.sailings.length === 0) {
      lines.push('No sailings found for this route and date.');
    } else {
      for (const s of result.sailings) {
        const cancelled = s.isCancelled ? ' ~~CANCELLED~~' : '';
        const dep = s.departureTime ?? 'Unknown';
        const arr = s.arrivalTime ? ` → ${s.arrivalTime}` : '';
        const vessel = s.vesselName ? ` | ${s.vesselName}` : '';
        lines.push(`- ${dep}${arr}${vessel}${cancelled}`);
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
