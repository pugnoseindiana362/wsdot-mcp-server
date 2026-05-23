/**
 * @fileoverview Domain types for the WSF (Washington State Ferries) API.
 * @module services/ferry/types
 */

/** Raw ferry terminal from upstream API. */
export interface RawFerryTerminal {
  Latitude?: number | null;
  Longitude?: number | null;
  TerminalAbbrev?: string | null;
  TerminalID?: number | null;
  TerminalName?: string | null;
}

/** Normalized ferry terminal. */
export interface FerryTerminal {
  latitude?: number;
  longitude?: number;
  terminalAbbrev?: string;
  terminalId: number;
  terminalName: string;
}

/** Raw ferry route from upstream API. */
export interface RawFerryRoute {
  ArrivingTerminalID?: number | null;
  ArrivingTerminalName?: string | null;
  CrossingTime?: number | null;
  DepartingTerminalID?: number | null;
  DepartingTerminalName?: string | null;
  RouteID?: number | null;
  RouteName?: string | null;
}

/** Normalized ferry route. */
export interface FerryRoute {
  arrivingTerminalId?: number;
  arrivingTerminalName?: string;
  crossingTimeInMinutes?: number;
  departingTerminalId?: number;
  departingTerminalName?: string;
  routeId?: number;
  routeName?: string;
}

/** Raw sailing in a schedule response. */
export interface RawSailing {
  /** Actual API field name (was ArrivalTime in older API). */
  ArrivingTime?: string | null;
  /** Actual API field name (was DepartureTime in older API). */
  DepartingTime?: string | null;
  IsCancelled?: boolean | null;
  VesselID?: number | null;
  VesselName?: string | null;
}

/** Terminal combo entry within a schedule response. */
export interface RawTerminalCombo {
  ArrivingTerminalID?: number | null;
  ArrivingTerminalName?: string | null;
  DepartingTerminalID?: number | null;
  DepartingTerminalName?: string | null;
  Times?: RawSailing[] | null;
}

/** Raw ferry schedule response — times are nested under TerminalCombos[0].Times. */
export interface RawFerrySchedule {
  ScheduleID?: number | null;
  ScheduleName?: string | null;
  TerminalCombos?: RawTerminalCombo[] | null;
}

/** Normalized sailing. */
export interface Sailing {
  arrivalTime?: string;
  departureTime?: string;
  isCancelled?: boolean;
  vesselName?: string;
}

/** Normalized ferry schedule. */
export interface FerrySchedule {
  arrivingTerminalName?: string;
  departingTerminalName?: string;
  sailings: Sailing[];
  tripDate: string;
}

/** Raw vessel location from upstream API. */
export interface RawVesselLocation {
  ArrivingTerminalID?: number | null;
  ArrivingTerminalName?: string | null;
  AtDock?: boolean | null;
  DepartingTerminalID?: number | null;
  DepartingTerminalName?: string | null;
  Eta?: string | null;
  Heading?: number | null;
  InService?: boolean | null;
  Latitude?: number | null;
  LeftDock?: string | null;
  Longitude?: number | null;
  OpRouteAbbrev?: string[] | null;
  ScheduledDeparture?: string | null;
  Speed?: number | null;
  TimeStamp?: string | null;
  VesselID?: number | null;
  VesselName?: string | null;
}

/** Normalized vessel location. */
export interface VesselLocation {
  arrivingTerminalId?: number;
  arrivingTerminalName?: string;
  atDock?: boolean;
  departingTerminalId?: number;
  departingTerminalName?: string;
  eta?: string;
  heading?: number;
  inService?: boolean;
  latitude?: number;
  leftDock?: string;
  longitude?: number;
  opRouteAbbrev: string[];
  scheduledDeparture?: string;
  speed?: number;
  timestamp?: string;
  vesselId?: number;
  vesselName?: string;
}

/** Space availability for one arriving terminal within a departure. */
export interface RawSpaceForArrivalTerminal {
  DriveUpSpaceCount?: number | null;
  DriveUpSpaceHexColor?: string | null;
  MaxSpaceCount?: number | null;
  ReservableSpaceCount?: number | null;
  ReservableSpaceHexColor?: string | null;
  TerminalID?: number | null;
  TerminalName?: string | null;
}

/** Raw departure space entry from upstream API. */
export interface RawDepartureSpace {
  Departure?: string | null;
  IsCancelled?: boolean | null;
  MaxSpaceCount?: number | null;
  /** Space counts are nested per arriving terminal. */
  SpaceForArrivalTerminals?: RawSpaceForArrivalTerminal[] | null;
  VesselID?: number | null;
  VesselName?: string | null;
}

/** Raw terminal sailing space from upstream API. */
export interface RawTerminalSailingSpace {
  DepartingSpaces?: RawDepartureSpace[] | null;
  TerminalID?: number | null;
  TerminalName?: string | null;
}

/** Normalized departure space. */
export interface DepartureSpace {
  arrivingTerminalName?: string;
  departure?: string;
  driveUpSpaceCount?: number;
  driveUpSpaceHexColor?: string;
  isCancelled?: boolean;
  maxSpaceCount?: number;
  reservableSpaceCount?: number;
  vesselName?: string;
}

/** Normalized terminal sailing space. */
export interface TerminalSailingSpace {
  departingSpaces: DepartureSpace[];
  terminalId?: number;
  terminalName?: string;
}

/** Raw ferry alert from upstream API. */
export interface RawFerryAlert {
  /** Route IDs affected by this alert (was ImpactedRouteIds in older API). */
  AffectedRouteIDs?: number[] | null;
  /** Fallback title when RouteAlertText is absent. */
  AlertFullTitle?: string | null;
  AlertType?: string | null;
  /** Unique alert ID (was AlertID in older API). */
  BulletinID?: number | null;
  /** WCF date string — decoded to ISO 8601 during normalization. */
  PublishDate?: string | null;
  /** Plain-text description (preferred over BulletinText which contains HTML). */
  RouteAlertText?: string | null;
}

/** Normalized ferry alert. */
export interface FerryAlert {
  alertDescription?: string;
  alertId?: number;
  impactedRouteIds: number[];
  publishDate?: string;
}
