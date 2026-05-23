/**
 * @fileoverview WSF (Washington State Ferries) API service — terminals, routes,
 * schedules, vessel locations, terminal space, and alerts.
 * @module services/ferry/ferry-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { invalidParams, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { withRetry } from '@cyanheads/mcp-ts-core/utils';
import { getServerConfig } from '@/config/server-config.js';
import type {
  FerryAlert,
  FerryRoute,
  FerrySchedule,
  FerryTerminal,
  RawFerryAlert,
  RawFerryRoute,
  RawFerrySchedule,
  RawFerryTerminal,
  RawTerminalSailingSpace,
  RawVesselLocation,
  TerminalSailingSpace,
  VesselLocation,
} from './types.js';

const BASE_URL = 'https://www.wsdot.wa.gov/Ferries/API';
const TIMEOUT_MS = 15_000;

export class FerryApiService {
  constructor(_config: AppConfig, _storage: StorageService) {}

  private accessCode(): string {
    return getServerConfig().accessCode;
  }

  private buildUrl(path: string): string {
    return `${BASE_URL}/${path}?apiaccesscode=${this.accessCode()}`;
  }

  private fetchJson<T>(path: string, ctx: Context): Promise<T> {
    const url = this.buildUrl(path);
    return withRetry(
      async () => {
        const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
        const signal = ctx.signal.aborted
          ? ctx.signal
          : AbortSignal.any([ctx.signal, timeoutSignal]);
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw serviceUnavailable(`WSF Ferry API returned HTTP ${response.status}.`, {
            url,
            status: response.status,
          });
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) {
          throw serviceUnavailable(
            'WSF Ferry API returned an HTML page instead of JSON. Verify that WSDOT_ACCESS_CODE is set to a valid access code.',
            { url },
          );
        }
        const text = await response.text();
        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw serviceUnavailable(
            'WSF Ferry API returned HTML content. Verify that WSDOT_ACCESS_CODE is set to a valid access code.',
            { url },
          );
        }
        const parsed = JSON.parse(text) as T;
        // Ferry API returns HTTP 200 with {"Message":"..."} for validation errors
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          'Message' in (parsed as Record<string, unknown>)
        ) {
          const msg = (parsed as Record<string, unknown>).Message as string;
          throw invalidParams(`WSF Ferry API error: ${msg}`, { url });
        }
        return parsed;
      },
      {
        operation: 'FerryApiService.fetchJson',
        baseDelayMs: 1000,
        signal: ctx.signal,
      },
    );
  }

  /** Convert ISO 8601 or YYYY-MM-DD date string to M/D/YYYY format used by ferry API paths. */
  static toFerryDate(isoDate: string): string {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) {
      throw invalidParams(
        `Invalid date: "${isoDate}". Expected ISO 8601 format (e.g. 2026-05-23).`,
      );
    }
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  }

  /** Return today's date in M/D/YYYY format. */
  static todayFerryDate(): string {
    const d = new Date();
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  }

  async getTerminals(ctx: Context): Promise<FerryTerminal[]> {
    ctx.log.info('Fetching ferry terminals');
    const raw = await this.fetchJson<RawFerryTerminal[]>('Terminals/rest/terminalbasics', ctx);
    return (raw ?? []).map((t) => ({
      terminalId: t.TerminalID ?? 0,
      terminalName: t.TerminalName ?? 'Unknown',
      ...(t.TerminalAbbrev != null && { terminalAbbrev: t.TerminalAbbrev }),
      ...(t.Latitude != null && { latitude: t.Latitude }),
      ...(t.Longitude != null && { longitude: t.Longitude }),
    }));
  }

  async getRoutes(tripDate: string, ctx: Context): Promise<FerryRoute[]> {
    ctx.log.info('Fetching ferry routes', { tripDate });
    const raw = await this.fetchJson<RawFerryRoute[]>(`Schedule/rest/routes/${tripDate}`, ctx);
    return (raw ?? []).map((r) => ({
      ...(r.RouteID != null && { routeId: r.RouteID }),
      ...(r.RouteName != null && { routeName: r.RouteName }),
      ...(r.CrossingTime != null && { crossingTimeInMinutes: r.CrossingTime }),
      ...(r.DepartingTerminalID != null && { departingTerminalId: r.DepartingTerminalID }),
      ...(r.DepartingTerminalName != null && { departingTerminalName: r.DepartingTerminalName }),
      ...(r.ArrivingTerminalID != null && { arrivingTerminalId: r.ArrivingTerminalID }),
      ...(r.ArrivingTerminalName != null && { arrivingTerminalName: r.ArrivingTerminalName }),
    }));
  }

  async getSchedule(
    departingTerminalId: number,
    arrivingTerminalId: number,
    tripDate: string,
    remainingOnly: boolean,
    ctx: Context,
  ): Promise<FerrySchedule> {
    let path: string;
    const todayDate = FerryApiService.todayFerryDate();

    if (tripDate === todayDate || remainingOnly) {
      const flag = remainingOnly ? 'true' : 'false';
      path = `Schedule/rest/scheduletoday/${departingTerminalId}/${arrivingTerminalId}/${flag}`;
    } else {
      path = `Schedule/rest/schedule/${tripDate}/${departingTerminalId}/${arrivingTerminalId}`;
    }

    ctx.log.info('Fetching ferry schedule', {
      departingTerminalId,
      arrivingTerminalId,
      tripDate,
      remainingOnly,
    });
    const raw = await this.fetchJson<RawFerrySchedule>(path, ctx);

    return {
      ...(raw.RouteName != null && { routeName: raw.RouteName }),
      ...(raw.DepartingTerminalName != null && {
        departingTerminalName: raw.DepartingTerminalName,
      }),
      ...(raw.ArrivingTerminalName != null && { arrivingTerminalName: raw.ArrivingTerminalName }),
      tripDate,
      sailings: (raw.Times ?? []).map((s) => ({
        ...(s.DepartureTime != null && { departureTime: s.DepartureTime }),
        ...(s.ArrivalTime != null && { arrivalTime: s.ArrivalTime }),
        ...(typeof s.IsCancelled === 'boolean' && { isCancelled: s.IsCancelled }),
        ...(s.VesselName != null && { vesselName: s.VesselName }),
      })),
    };
  }

  async getVesselLocations(ctx: Context): Promise<VesselLocation[]> {
    ctx.log.info('Fetching vessel locations');
    const raw = await this.fetchJson<RawVesselLocation[]>('Vessels/rest/vessellocations', ctx);
    return (raw ?? []).map((v) => ({
      ...(v.VesselID != null && { vesselId: v.VesselID }),
      ...(v.VesselName != null && { vesselName: v.VesselName }),
      ...(typeof v.InService === 'boolean' && { inService: v.InService }),
      ...(typeof v.AtDock === 'boolean' && { atDock: v.AtDock }),
      ...(v.DepartingTerminalID != null && { departingTerminalId: v.DepartingTerminalID }),
      ...(v.DepartingTerminalName != null && { departingTerminalName: v.DepartingTerminalName }),
      ...(v.ArrivingTerminalID != null && { arrivingTerminalId: v.ArrivingTerminalID }),
      ...(v.ArrivingTerminalName != null && { arrivingTerminalName: v.ArrivingTerminalName }),
      ...(v.Latitude != null && { latitude: v.Latitude }),
      ...(v.Longitude != null && { longitude: v.Longitude }),
      ...(v.Speed != null && { speed: v.Speed }),
      ...(v.Heading != null && { heading: v.Heading }),
      ...(v.LeftDock != null && { leftDock: v.LeftDock }),
      ...(v.Eta != null && { eta: v.Eta }),
      ...(v.ScheduledDeparture != null && { scheduledDeparture: v.ScheduledDeparture }),
      opRouteAbbrev: v.OpRouteAbbrev ?? [],
      ...(v.TimeStamp != null && { timestamp: v.TimeStamp }),
    }));
  }

  async getTerminalSailingSpace(ctx: Context): Promise<TerminalSailingSpace[]> {
    ctx.log.info('Fetching terminal sailing space');
    const raw = await this.fetchJson<RawTerminalSailingSpace[]>(
      'Terminals/rest/terminalsailingspace',
      ctx,
    );
    return (raw ?? []).map((t) => ({
      ...(t.TerminalID != null && { terminalId: t.TerminalID }),
      ...(t.TerminalName != null && { terminalName: t.TerminalName }),
      departingSpaces: (t.DepartingSpaces ?? []).map((s) => ({
        ...(s.Departure != null && { departure: s.Departure }),
        ...(typeof s.IsCancelled === 'boolean' && { isCancelled: s.IsCancelled }),
        ...(s.VesselName != null && { vesselName: s.VesselName }),
        ...(s.ArrivingTerminalName != null && { arrivingTerminalName: s.ArrivingTerminalName }),
        ...(s.DriveUpSpaceCount != null && { driveUpSpaceCount: s.DriveUpSpaceCount }),
        ...(s.ReservableSpaceCount != null && { reservableSpaceCount: s.ReservableSpaceCount }),
        ...(s.MaxSpaceCount != null && { maxSpaceCount: s.MaxSpaceCount }),
        ...(s.DriveUpSpaceHexColor != null && { driveUpSpaceHexColor: s.DriveUpSpaceHexColor }),
      })),
    }));
  }

  async getAlerts(ctx: Context): Promise<FerryAlert[]> {
    ctx.log.info('Fetching ferry alerts');
    const raw = await this.fetchJson<RawFerryAlert[]>('Schedule/rest/alerts', ctx);
    return (raw ?? []).map((a) => ({
      ...(a.AlertID != null && { alertId: a.AlertID }),
      ...(a.AlertDescription != null && { alertDescription: a.AlertDescription }),
      impactedRouteIds: a.ImpactedRouteIds ?? [],
      ...(a.PublishDate != null && { publishDate: a.PublishDate }),
      ...(a.ExpireDate != null && { expireDate: a.ExpireDate }),
    }));
  }
}

// --- Init/accessor pattern ---

let _service: FerryApiService | undefined;

export function initFerryApiService(config: AppConfig, storage: StorageService): void {
  _service = new FerryApiService(config, storage);
}

export function getFerryApiService(): FerryApiService {
  if (!_service) {
    throw new Error('FerryApiService not initialized — call initFerryApiService() in setup()');
  }
  return _service;
}
