export interface DwellTimeResponse {
  averageDwellTime: number;
  unit: string;
  comparison?: {
    previous: number;
    change: number;
    changePercent: number;
  };
}

export interface FootfallResponse {
  siteId: string;
  fromUtc: number;
  toUtc: number;
  footfall: number;
}

export interface OccupancyDataPoint {
  timestamp: string;
  occupancy: number;
}

export interface OccupancyResponse {
  currentOccupancy: number;
  timeseries: OccupancyDataPoint[];
  comparison?: {
    previous: number;
    change: number;
    changePercent: number;
  };
}

export interface DemographicsDataPoint {
  timestamp: string;
  male: number;
  female: number;
}

export interface DemographicsResponse {
  current: {
    male: number;
    female: number;
  };
  timeseries: DemographicsDataPoint[];
}

export interface EntryExitRecord {
  personId: string;
  personName: string;
  gender: 'male' | 'female';
  zoneId?: string;
  zoneName?: string;
  severity?: 'low' | 'medium' | 'high';
  entryUtc: number;
  entryLocal: string;
  exitUtc: number | null;
  exitLocal: string | null;
  dwellMinutes: number | null;
}

export interface EntryExitResponse {
  siteId: string;
  pageSize: number;
  pageNumber: number;
  totalRecords: number;
  totalPages: number;
  records: EntryExitRecord[];
}

export interface PaginationRequest {
  page?: number;
  pageNumber?: number;
  pageSize: number;
  siteId?: string;
  zoneId?: string;
}
