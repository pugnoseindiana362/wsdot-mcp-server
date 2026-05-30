/**
 * @fileoverview Tests for TrafficApiService normalization logic: raw → domain type
 * mapping, HTTP error handling, HTML detection, and sparse upstream payloads.
 * All external HTTP is mocked — no real network calls.
 * @module tests/services/traffic-service.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Inline TrafficApiService so we can call normalization helpers directly
// without triggering the global init singleton.
// We import the class directly (not the singleton accessor).
// ---------------------------------------------------------------------------

// Mock getServerConfig so the class doesn't read env vars at instantiation
vi.mock('@/config/server-config.js', () => ({
  getServerConfig: () => ({ accessCode: 'test-access-code' }),
}));

// Mock withRetry to execute the wrapped function immediately (no retries)
vi.mock('@cyanheads/mcp-ts-core/utils', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

import { TrafficApiService } from '@/services/traffic/traffic-service.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to build a Response-like object
function makeResponse(body: unknown, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('TrafficApiService — mountain pass normalization', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps all raw fields to domain fields', async () => {
    const raw = [
      {
        MountainPassId: 1,
        MountainPassName: 'Snoqualmie Pass',
        Elevation: 3022,
        TemperatureInFahrenheit: 28,
        WeatherCondition: 'Snow',
        RoadCondition: 'Snow and Ice Covered',
        TravelAdvisoryActive: true,
        RestrictionOne: {
          TravelRestrictionComment: 'Traction Tires Required',
          RestrictionType: 'TractionsRequired',
        },
        DateUpdated: '/Date(1700000000000-0800)/',
        Latitude: 47.4273,
        Longitude: -121.4128,
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const passes = await svc.getMountainPasses(ctx);

    expect(passes).toHaveLength(1);
    const p = passes[0];
    expect(p.mountainPassId).toBe(1);
    expect(p.mountainPassName).toBe('Snoqualmie Pass');
    expect(p.elevation).toBe(3022);
    expect(p.temperatureInFahrenheit).toBe(28);
    expect(p.weatherCondition).toBe('Snow');
    expect(p.roadCondition).toBe('Snow and Ice Covered');
    expect(p.travelAdvisoryActive).toBe(true);
    expect(p.restrictionOne?.comment).toBe('Traction Tires Required');
    expect(p.restrictionOne?.type).toBe('TractionsRequired');
    expect(p.latitude).toBe(47.4273);
    expect(p.longitude).toBe(-121.4128);
  });

  it('omits optional fields when raw values are null', async () => {
    const raw = [
      {
        MountainPassId: 2,
        MountainPassName: 'Blewett Pass',
        Elevation: null,
        TemperatureInFahrenheit: null,
        WeatherCondition: null,
        RoadCondition: null,
        TravelAdvisoryActive: null,
        RestrictionOne: null,
        Latitude: null,
        Longitude: null,
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const passes = await svc.getMountainPasses(ctx);

    const p = passes[0];
    expect(p.mountainPassId).toBe(2);
    expect(p.mountainPassName).toBe('Blewett Pass');
    expect('elevation' in p).toBe(false);
    expect('temperatureInFahrenheit' in p).toBe(false);
    expect('weatherCondition' in p).toBe(false);
    expect('roadCondition' in p).toBe(false);
    expect('travelAdvisoryActive' in p).toBe(false);
    expect('restrictionOne' in p).toBe(false);
    expect('latitude' in p).toBe(false);
    expect('longitude' in p).toBe(false);
  });

  it('falls back to defaults when MountainPassId/Name are null', async () => {
    const raw = [{ MountainPassId: null, MountainPassName: null }];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const passes = await svc.getMountainPasses(ctx);
    expect(passes[0].mountainPassId).toBe(0);
    expect(passes[0].mountainPassName).toBe('Unknown');
  });

  it('omits restrictionOne when both comment and type are absent', async () => {
    const raw = [
      {
        MountainPassId: 3,
        MountainPassName: 'White Pass',
        RestrictionOne: { TravelRestrictionComment: null, RestrictionType: null },
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const passes = await svc.getMountainPasses(ctx);
    expect('restrictionOne' in passes[0]).toBe(false);
  });

  it('returns empty array when API returns []', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    const passes = await svc.getMountainPasses(ctx);
    expect(passes).toHaveLength(0);
  });
});

describe('TrafficApiService — alert normalization', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('maps raw alert fields to domain fields', async () => {
    const raw = [
      {
        AlertID: 101,
        HeadlineDescription: 'I-90 Closure',
        ExtendedDescription: 'All lanes blocked',
        EventCategory: 'Closure',
        EventStatus: 'Active',
        Priority: 'High',
        Region: 'Northwest',
        County: 'King',
        StartRoadwayLocation: {
          RoadName: 'I-90',
          Direction: 'Both',
          MilePost: 30,
          Latitude: 47.5,
          Longitude: -121.7,
        },
        StartTime: '/Date(1700000000000-0800)/',
        LastUpdatedTime: '/Date(1700001000000-0800)/',
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const alerts = await svc.searchAlerts({}, ctx);

    expect(alerts).toHaveLength(1);
    const a = alerts[0];
    expect(a.alertId).toBe(101);
    expect(a.headlineDescription).toBe('I-90 Closure');
    expect(a.eventCategory).toBe('Closure');
    expect(a.region).toBe('Northwest');
    expect(a.startRoadwayLocation?.roadName).toBe('I-90');
    expect(a.startRoadwayLocation?.milePost).toBe(30);
  });

  it('omits optional fields when raw values are null', async () => {
    const raw = [
      {
        AlertID: 102,
        HeadlineDescription: null,
        EventCategory: null,
        StartRoadwayLocation: null,
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const alerts = await svc.searchAlerts({}, ctx);
    const a = alerts[0];
    expect(a.alertId).toBe(102);
    expect('headlineDescription' in a).toBe(false);
    expect('eventCategory' in a).toBe(false);
    expect('startRoadwayLocation' in a).toBe(false);
  });

  it('uses SearchAlertsAsJson endpoint when stateRoute filter provided', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.searchAlerts({ stateRoute: '090' }, ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('SearchAlertsAsJson');
    expect(url).toContain('StateRoute=090');
  });

  it('uses GetAlertsAsJson endpoint when no filter provided', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.searchAlerts({}, ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('GetAlertsAsJson');
  });

  it('includes region filter in query string when provided', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.searchAlerts({ region: 'Northwest' }, ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('Region=Northwest');
  });

  it('includes milepost range when provided', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.searchAlerts({ startMilepost: 10, endMilepost: 50 }, ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('StartingMilepost=10');
    expect(url).toContain('EndingMilepost=50');
  });
});

describe('TrafficApiService — travel time normalization', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('maps raw travel time fields to domain fields', async () => {
    const raw = [
      {
        TravelTimeID: 1,
        Name: 'I-5 NB: Northgate to Downtown',
        Description: 'I-5 northbound',
        CurrentTime: 18,
        AverageTime: 12,
        TimeUpdated: '/Date(1700000000000-0800)/',
        Distance: 6.2,
        StartPoint: { RoadName: 'I-5', Direction: 'N', MilePost: 168 },
        EndPoint: { RoadName: 'I-5', Direction: 'N', MilePost: 174 },
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const times = await svc.getTravelTimes(ctx);

    expect(times).toHaveLength(1);
    const t = times[0];
    expect(t.travelTimeId).toBe(1);
    expect(t.name).toBe('I-5 NB: Northgate to Downtown');
    expect(t.currentTimeInMinutes).toBe(18);
    expect(t.averageTimeInMinutes).toBe(12);
    expect(t.distanceInMiles).toBe(6.2);
    expect(t.startPoint?.roadName).toBe('I-5');
    expect(t.endPoint?.milePost).toBe(174);
  });

  it('omits optional fields when raw values are null', async () => {
    const raw = [{ TravelTimeID: null, Name: null, CurrentTime: null, AverageTime: null }];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const times = await svc.getTravelTimes(ctx);
    const t = times[0];
    expect('travelTimeId' in t).toBe(false);
    expect('name' in t).toBe(false);
    expect('currentTimeInMinutes' in t).toBe(false);
    expect('averageTimeInMinutes' in t).toBe(false);
  });
});

describe('TrafficApiService — toll rate normalization', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('maps raw toll rate fields to domain fields', async () => {
    const raw = [
      {
        TripName: 'SR 520 Express Toll',
        StateRoute: '520',
        StartMilepost: 0,
        EndMilepost: 10.5,
        TollRate: 3.5,
        Message: 'Active',
        SignText: '$3.50',
        StartLocationName: '148th Ave NE',
        EndLocationName: 'I-5 interchange',
        TimeUpdated: '/Date(1700000000000-0800)/',
        TollCondition: 1,
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const rates = await svc.getTollRates(ctx);

    expect(rates).toHaveLength(1);
    const r = rates[0];
    expect(r.tripName).toBe('SR 520 Express Toll');
    expect(r.stateRoute).toBe('520');
    expect(r.tollRateInDollars).toBe(3.5);
    expect(r.startLocationName).toBe('148th Ave NE');
    expect(r.tollCondition).toBe(1);
  });

  it('omits optional fields when raw values are null', async () => {
    const raw = [{ TripName: null, TollRate: null }];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const rates = await svc.getTollRates(ctx);
    expect('tripName' in rates[0]).toBe(false);
    expect('tollRateInDollars' in rates[0]).toBe(false);
  });
});

describe('TrafficApiService — border crossing normalization', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('maps raw border crossing fields to domain fields', async () => {
    const raw = [
      {
        CrossingName: 'Peace Arch',
        WaitTime: 25,
        UpdateTime: '/Date(1700000000000-0800)/',
        BorderCrossingLocation: {
          RoadName: 'I-5',
          Direction: 'N',
          MilePost: 275,
          Latitude: 49.002,
          Longitude: -122.755,
        },
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const crossings = await svc.getBorderCrossings(ctx);

    expect(crossings).toHaveLength(1);
    const c = crossings[0];
    expect(c.crossingName).toBe('Peace Arch');
    expect(c.waitTimeInMinutes).toBe(25);
    expect(c.location?.roadName).toBe('I-5');
    expect(c.location?.latitude).toBe(49.002);
  });

  it('omits location when BorderCrossingLocation is null', async () => {
    const raw = [{ CrossingName: 'Sumas', WaitTime: null, BorderCrossingLocation: null }];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const crossings = await svc.getBorderCrossings(ctx);
    expect('location' in crossings[0]).toBe(false);
    expect('waitTimeInMinutes' in crossings[0]).toBe(false);
  });
});

describe('TrafficApiService — camera normalization', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('maps raw camera fields to domain fields', async () => {
    const raw = [
      {
        CameraID: 1001,
        Title: 'I-90 at Snoqualmie Pass',
        Description: 'Summit viewpoint',
        ImageURL: 'https://images.wsdot.wa.gov/nc/090vc12345.jpg',
        ImageWidth: 320,
        ImageHeight: 240,
        RoadName: 'I-90',
        Direction: 'EB',
        MilePost: 52,
        Region: 'Northwest',
        Latitude: 47.4,
        Longitude: -121.4,
      },
    ];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const cameras = await svc.searchCameras({}, ctx);

    expect(cameras).toHaveLength(1);
    const c = cameras[0];
    expect(c.cameraId).toBe(1001);
    expect(c.title).toBe('I-90 at Snoqualmie Pass');
    expect(c.imageUrl).toBe('https://images.wsdot.wa.gov/nc/090vc12345.jpg');
    expect(c.imageWidth).toBe(320);
    expect(c.region).toBe('Northwest');
  });

  it('omits optional fields when raw values are null', async () => {
    const raw = [{ CameraID: null, Title: null, ImageURL: null }];
    mockFetch.mockResolvedValue(makeResponse(raw));
    const ctx = createMockContext();
    const cameras = await svc.searchCameras({}, ctx);
    expect('cameraId' in cameras[0]).toBe(false);
    expect('title' in cameras[0]).toBe(false);
    expect('imageUrl' in cameras[0]).toBe(false);
  });

  it('uses SearchCamerasAsJson endpoint when stateRoute filter provided', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.searchCameras({ stateRoute: '090' }, ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('SearchCamerasAsJson');
    expect(url).toContain('StateRoute=090');
  });

  it('uses GetCamerasAsJson endpoint when no filter provided', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.searchCameras({}, ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('GetCamerasAsJson');
  });
});

describe('TrafficApiService — HTTP error handling', () => {
  let svc: TrafficApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrafficApiService({} as never, {} as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('throws serviceUnavailable on HTTP 503', async () => {
    mockFetch.mockResolvedValue(makeResponse('Service Unavailable', 503, 'text/plain'));
    const ctx = createMockContext();
    await expect(svc.getMountainPasses(ctx)).rejects.toThrow(/503/);
  });

  it('throws serviceUnavailable on HTTP 401', async () => {
    mockFetch.mockResolvedValue(makeResponse('Unauthorized', 401, 'text/plain'));
    const ctx = createMockContext();
    await expect(svc.getMountainPasses(ctx)).rejects.toThrow(/401/);
  });

  it('throws serviceUnavailable when Content-Type is text/html', async () => {
    mockFetch.mockResolvedValue(makeResponse('<html>Login</html>', 200, 'text/html'));
    const ctx = createMockContext();
    await expect(svc.getMountainPasses(ctx)).rejects.toThrow(/HTML page/);
  });

  it('throws serviceUnavailable when body is an HTML document (no CT header)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: () => Promise.resolve('<!DOCTYPE html><html><body>Login</body></html>'),
    });
    const ctx = createMockContext();
    await expect(svc.getMountainPasses(ctx)).rejects.toThrow(/HTML content/);
  });

  it('appends AccessCode to every request URL', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.getMountainPasses(ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('AccessCode=test-access-code');
  });

  it('uses BASE_URL prefix', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ctx = createMockContext();
    await svc.getMountainPasses(ctx);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('https://www.wsdot.wa.gov/Traffic/api');
  });
});
