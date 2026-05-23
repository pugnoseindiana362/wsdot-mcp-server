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
  ArrivalTime?: string | null;
  DepartureTime?: string | null;
  IsCancelled?: boolean | null;
  VesselID?: number | null;
  VesselName?: string | null;
}

/** Raw ferry schedule response. */
export interface RawFerrySchedule {
  AllDayBooked?: boolean | null;
  ArrivingTerminalName?: string | null;
  DepartingTerminalName?: string | null;
  RouteName?: string | null;
  Times?: RawSailing[] | null;
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
  routeName?: string;
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

/** Raw departure space entry from upstream API. */
export interface RawDepartureSpace {
  ArrivingTerminalName?: string | null;
  Departure?: string | null;
  DriveUpSpaceCount?: number | null;
  DriveUpSpaceHexColor?: string | null;
  IsCancelled?: boolean | null;
  MaxSpaceCount?: number | null;
  ReservableSpaceCount?: number | null;
  ReservableSpaceHexColor?: string | null;
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
  AlertDescription?: string | null;
  AlertID?: number | null;
  ExpireDate?: string | null;
  ImpactedRouteIds?: number[] | null;
  PublishDate?: string | null;
}

/** Normalized ferry alert. */
export interface FerryAlert {
  alertDescription?: string;
  alertId?: number;
  expireDate?: string;
  impactedRouteIds: number[];
  publishDate?: string;
}
