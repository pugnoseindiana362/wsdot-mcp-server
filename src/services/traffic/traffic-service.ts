/**
 * @fileoverview WSDOT Traffic API service — mountain passes, alerts, travel times,
 * toll rates, border crossings, and cameras.
 * @module services/traffic/traffic-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { withRetry } from '@cyanheads/mcp-ts-core/utils';
import { getServerConfig } from '@/config/server-config.js';
import type {
  BorderCrossing,
  Camera,
  HighwayAlert,
  MountainPass,
  RawAlertListResponse,
  RawAlertSearchResponse,
  RawBorderCrossingsResponse,
  RawCameraListResponse,
  RawCameraSearchResponse,
  RawMountainPassResponse,
  RawTollRatesResponse,
  RawTravelTimesResponse,
  TollRate,
  TravelTime,
} from './types.js';

const BASE_URL = 'https://www.wsdot.wa.gov/Traffic/api';
const TIMEOUT_MS = 15_000;

/** Alert search parameters for `SearchAlertsAsJson`. */
export interface AlertSearchParams {
  endMilepost?: number;
  region?: string;
  startMilepost?: number;
  stateRoute?: string;
}

/** Camera search parameters for `SearchCamerasAsJson`. */
export interface CameraSearchParams {
  endMilepost?: number;
  region?: string;
  startMilepost?: number;
  stateRoute?: string;
}

export class TrafficApiService {
  constructor(_config: AppConfig, _storage: StorageService) {}

  private accessCode(): string {
    return getServerConfig().accessCode;
  }

  private fetchJson<T>(path: string, ctx: Context): Promise<T> {
    const url = `${BASE_URL}/${path}${path.includes('?') ? '&' : '?'}AccessCode=${this.accessCode()}`;
    return withRetry(
      async () => {
        const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
        const signal = ctx.signal.aborted
          ? ctx.signal
          : AbortSignal.any([ctx.signal, timeoutSignal]);
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw serviceUnavailable(`WSDOT Traffic API returned HTTP ${response.status}.`, {
            url,
            status: response.status,
          });
        }
        // Auth failure returns HTML, not JSON — detect by Content-Type
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) {
          throw serviceUnavailable(
            'WSDOT Traffic API returned an HTML page instead of JSON. Verify that WSDOT_ACCESS_CODE is set to a valid access code.',
            { url },
          );
        }
        const text = await response.text();
        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw serviceUnavailable(
            'WSDOT Traffic API returned HTML content. Verify that WSDOT_ACCESS_CODE is set to a valid access code.',
            { url },
          );
        }
        return JSON.parse(text) as T;
      },
      {
        operation: 'TrafficApiService.fetchJson',
        baseDelayMs: 1000,
        signal: ctx.signal,
      },
    );
  }

  async getMountainPasses(ctx: Context): Promise<MountainPass[]> {
    ctx.log.info('Fetching mountain pass conditions');
    const raw = await this.fetchJson<RawMountainPassResponse>(
      'MountainPassConditions/MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson',
      ctx,
    );
    const passes = raw.GetMountainPassConditionsAsJsonResult ?? [];
    return passes.map((p) => ({
      mountainPassId: p.MountainPassId ?? 0,
      mountainPassName: p.MountainPassName ?? 'Unknown',
      ...(p.Elevation != null && { elevation: p.Elevation }),
      ...(p.TemperatureInFahrenheit != null && {
        temperatureInFahrenheit: p.TemperatureInFahrenheit,
      }),
      ...(p.WeatherCondition != null && { weatherCondition: p.WeatherCondition }),
      ...(p.RoadCondition != null && { roadCondition: p.RoadCondition }),
      ...(typeof p.TravelAdvisoryActive === 'boolean' && {
        travelAdvisoryActive: p.TravelAdvisoryActive,
      }),
      ...(p.RestrictionOne?.TravelRestrictionComment || p.RestrictionOne?.RestrictionType
        ? {
            restrictionOne: {
              ...(p.RestrictionOne.TravelRestrictionComment != null && {
                comment: p.RestrictionOne.TravelRestrictionComment,
              }),
              ...(p.RestrictionOne.RestrictionType != null && {
                type: p.RestrictionOne.RestrictionType,
              }),
            },
          }
        : {}),
      ...(p.RestrictionTwo?.TravelRestrictionComment || p.RestrictionTwo?.RestrictionType
        ? {
            restrictionTwo: {
              ...(p.RestrictionTwo.TravelRestrictionComment != null && {
                comment: p.RestrictionTwo.TravelRestrictionComment,
              }),
              ...(p.RestrictionTwo.RestrictionType != null && {
                type: p.RestrictionTwo.RestrictionType,
              }),
            },
          }
        : {}),
      ...(p.DateUpdated != null && { dateUpdated: p.DateUpdated }),
      ...(p.Latitude != null && { latitude: p.Latitude }),
      ...(p.Longitude != null && { longitude: p.Longitude }),
    }));
  }

  async searchAlerts(params: AlertSearchParams, ctx: Context): Promise<HighwayAlert[]> {
    const hasFilter =
      params.stateRoute ||
      params.region ||
      params.startMilepost != null ||
      params.endMilepost != null;
    let raw: HighwayAlert[];

    if (hasFilter) {
      const qs = new URLSearchParams();
      if (params.stateRoute) qs.set('StateRoute', params.stateRoute);
      if (params.region) qs.set('Region', params.region);
      if (params.startMilepost != null) qs.set('StartingMilepost', String(params.startMilepost));
      if (params.endMilepost != null) qs.set('EndingMilepost', String(params.endMilepost));
      const result = await this.fetchJson<RawAlertSearchResponse>(
        `HighwayAlerts/HighwayAlertsREST.svc/SearchAlertsAsJson?${qs.toString()}`,
        ctx,
      );
      raw = (result.SearchAlertsResult ?? []).map(normalizeAlert);
    } else {
      const result = await this.fetchJson<RawAlertListResponse>(
        'HighwayAlerts/HighwayAlertsREST.svc/GetAlertsAsJson',
        ctx,
      );
      raw = (result.GetAlertsResult ?? []).map(normalizeAlert);
    }

    return raw;
  }

  async getTravelTimes(ctx: Context): Promise<TravelTime[]> {
    ctx.log.info('Fetching travel times');
    const raw = await this.fetchJson<RawTravelTimesResponse>(
      'TravelTimes/TravelTimesREST.svc/GetTravelTimesAsJson',
      ctx,
    );
    const times = raw.GetTravelTimesAsJsonResult ?? [];
    return times.map((t) => ({
      ...(t.TravelTimeID != null && { travelTimeId: t.TravelTimeID }),
      ...(t.Name != null && { name: t.Name }),
      ...(t.Description != null && { description: t.Description }),
      ...(t.CurrentTime != null && { currentTimeInMinutes: t.CurrentTime }),
      ...(t.AverageTime != null && { averageTimeInMinutes: t.AverageTime }),
      ...(t.TimeUpdated != null && { timeUpdated: t.TimeUpdated }),
      ...(t.Distance != null && { distanceInMiles: t.Distance }),
      ...(t.StartPoint != null && {
        startPoint: {
          ...(t.StartPoint.RoadName != null && { roadName: t.StartPoint.RoadName }),
          ...(t.StartPoint.Direction != null && { direction: t.StartPoint.Direction }),
          ...(t.StartPoint.MilePost != null && { milePost: t.StartPoint.MilePost }),
        },
      }),
      ...(t.EndPoint != null && {
        endPoint: {
          ...(t.EndPoint.RoadName != null && { roadName: t.EndPoint.RoadName }),
          ...(t.EndPoint.Direction != null && { direction: t.EndPoint.Direction }),
          ...(t.EndPoint.MilePost != null && { milePost: t.EndPoint.MilePost }),
        },
      }),
    }));
  }

  async getTollRates(ctx: Context): Promise<TollRate[]> {
    ctx.log.info('Fetching toll rates');
    const raw = await this.fetchJson<RawTollRatesResponse>(
      'TollRates/TollRatesREST.svc/GetTollRatesAsJson',
      ctx,
    );
    const rates = raw.GetTollRatesAsJsonResult ?? [];
    return rates.map((r) => ({
      ...(r.TripName != null && { tripName: r.TripName }),
      ...(r.StateRoute != null && { stateRoute: r.StateRoute }),
      ...(r.StartMilepost != null && { startMilepost: r.StartMilepost }),
      ...(r.EndMilepost != null && { endMilepost: r.EndMilepost }),
      ...(r.TollRate != null && { tollRateInDollars: r.TollRate }),
      ...(r.Message != null && { message: r.Message }),
      ...(r.SignText != null && { signText: r.SignText }),
      ...(r.StartLocationName != null && { startLocationName: r.StartLocationName }),
      ...(r.EndLocationName != null && { endLocationName: r.EndLocationName }),
      ...(r.TimeUpdated != null && { timeUpdated: r.TimeUpdated }),
      ...(r.TollCondition != null && { tollCondition: r.TollCondition }),
    }));
  }

  async getBorderCrossings(ctx: Context): Promise<BorderCrossing[]> {
    ctx.log.info('Fetching border crossings');
    const raw = await this.fetchJson<RawBorderCrossingsResponse>(
      'BorderCrossings/BorderCrossingsREST.svc/GetBorderCrossingsAsJson',
      ctx,
    );
    const crossings = raw.GetBorderCrossingsAsJsonResult ?? [];
    return crossings.map((c) => ({
      ...(c.CrossingName != null && { crossingName: c.CrossingName }),
      ...(c.WaitTime != null && { waitTimeInMinutes: c.WaitTime }),
      ...(c.UpdateTime != null && { updateTime: c.UpdateTime }),
      ...(c.BorderCrossingLocation != null && {
        location: {
          ...(c.BorderCrossingLocation.RoadName != null && {
            roadName: c.BorderCrossingLocation.RoadName,
          }),
          ...(c.BorderCrossingLocation.Direction != null && {
            direction: c.BorderCrossingLocation.Direction,
          }),
          ...(c.BorderCrossingLocation.MilePost != null && {
            milePost: c.BorderCrossingLocation.MilePost,
          }),
          ...(c.BorderCrossingLocation.Latitude != null && {
            latitude: c.BorderCrossingLocation.Latitude,
          }),
          ...(c.BorderCrossingLocation.Longitude != null && {
            longitude: c.BorderCrossingLocation.Longitude,
          }),
        },
      }),
    }));
  }

  async searchCameras(params: CameraSearchParams, ctx: Context): Promise<Camera[]> {
    const hasFilter =
      params.stateRoute ||
      params.region ||
      params.startMilepost != null ||
      params.endMilepost != null;

    if (hasFilter) {
      const qs = new URLSearchParams();
      if (params.stateRoute) qs.set('StateRoute', params.stateRoute);
      if (params.region) qs.set('Region', params.region);
      if (params.startMilepost != null) qs.set('StartingMilepost', String(params.startMilepost));
      if (params.endMilepost != null) qs.set('EndingMilepost', String(params.endMilepost));
      const result = await this.fetchJson<RawCameraSearchResponse>(
        `HighwayCameras/HighwayCamerasREST.svc/SearchCamerasAsJson?${qs.toString()}`,
        ctx,
      );
      return (result.SearchCamerasAsJsonResult ?? []).map(normalizeCamera);
    } else {
      const result = await this.fetchJson<RawCameraListResponse>(
        'HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson',
        ctx,
      );
      return (result.GetCamerasAsJsonResult ?? []).map(normalizeCamera);
    }
  }
}

// --- Normalization helpers ---

function normalizeAlert(a: {
  AlertID?: number | null;
  HeadlineDescription?: string | null;
  ExtendedDescription?: string | null;
  EventCategory?: string | null;
  EventStatus?: string | null;
  Priority?: string | null;
  Region?: string | null;
  County?: string | null;
  StartRoadwayLocation?: {
    RoadName?: string | null;
    Direction?: string | null;
    MilePost?: number | null;
    Latitude?: number | null;
    Longitude?: number | null;
  } | null;
  EndRoadwayLocation?: {
    RoadName?: string | null;
    Direction?: string | null;
    MilePost?: number | null;
    Latitude?: number | null;
    Longitude?: number | null;
  } | null;
  StartTime?: string | null;
  EndTime?: string | null;
  LastUpdatedTime?: string | null;
}): HighwayAlert {
  return {
    ...(a.AlertID != null && { alertId: a.AlertID }),
    ...(a.HeadlineDescription != null && { headlineDescription: a.HeadlineDescription }),
    ...(a.ExtendedDescription != null && { extendedDescription: a.ExtendedDescription }),
    ...(a.EventCategory != null && { eventCategory: a.EventCategory }),
    ...(a.EventStatus != null && { eventStatus: a.EventStatus }),
    ...(a.Priority != null && { priority: a.Priority }),
    ...(a.Region != null && { region: a.Region }),
    ...(a.County != null && { county: a.County }),
    ...(a.StartRoadwayLocation != null && {
      startRoadwayLocation: {
        ...(a.StartRoadwayLocation.RoadName != null && {
          roadName: a.StartRoadwayLocation.RoadName,
        }),
        ...(a.StartRoadwayLocation.Direction != null && {
          direction: a.StartRoadwayLocation.Direction,
        }),
        ...(a.StartRoadwayLocation.MilePost != null && {
          milePost: a.StartRoadwayLocation.MilePost,
        }),
        ...(a.StartRoadwayLocation.Latitude != null && {
          latitude: a.StartRoadwayLocation.Latitude,
        }),
        ...(a.StartRoadwayLocation.Longitude != null && {
          longitude: a.StartRoadwayLocation.Longitude,
        }),
      },
    }),
    ...(a.EndRoadwayLocation != null && {
      endRoadwayLocation: {
        ...(a.EndRoadwayLocation.RoadName != null && { roadName: a.EndRoadwayLocation.RoadName }),
        ...(a.EndRoadwayLocation.Direction != null && {
          direction: a.EndRoadwayLocation.Direction,
        }),
        ...(a.EndRoadwayLocation.MilePost != null && { milePost: a.EndRoadwayLocation.MilePost }),
        ...(a.EndRoadwayLocation.Latitude != null && { latitude: a.EndRoadwayLocation.Latitude }),
        ...(a.EndRoadwayLocation.Longitude != null && {
          longitude: a.EndRoadwayLocation.Longitude,
        }),
      },
    }),
    ...(a.StartTime != null && { startTime: a.StartTime }),
    ...(a.EndTime != null && { endTime: a.EndTime }),
    ...(a.LastUpdatedTime != null && { lastUpdatedTime: a.LastUpdatedTime }),
  };
}

function normalizeCamera(c: {
  CameraID?: number | null;
  Title?: string | null;
  Description?: string | null;
  ImageURL?: string | null;
  ImageWidth?: number | null;
  ImageHeight?: number | null;
  RoadName?: string | null;
  Direction?: string | null;
  MilePost?: number | null;
  Region?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
}): Camera {
  return {
    ...(c.CameraID != null && { cameraId: c.CameraID }),
    ...(c.Title != null && { title: c.Title }),
    ...(c.Description != null && { description: c.Description }),
    ...(c.ImageURL != null && { imageUrl: c.ImageURL }),
    ...(c.ImageWidth != null && { imageWidth: c.ImageWidth }),
    ...(c.ImageHeight != null && { imageHeight: c.ImageHeight }),
    ...(c.RoadName != null && { roadName: c.RoadName }),
    ...(c.Direction != null && { direction: c.Direction }),
    ...(c.MilePost != null && { milePost: c.MilePost }),
    ...(c.Region != null && { region: c.Region }),
    ...(c.Latitude != null && { latitude: c.Latitude }),
    ...(c.Longitude != null && { longitude: c.Longitude }),
  };
}

// --- Init/accessor pattern ---

let _service: TrafficApiService | undefined;

export function initTrafficApiService(config: AppConfig, storage: StorageService): void {
  _service = new TrafficApiService(config, storage);
}

export function getTrafficApiService(): TrafficApiService {
  if (!_service) {
    throw new Error('TrafficApiService not initialized — call initTrafficApiService() in setup()');
  }
  return _service;
}
