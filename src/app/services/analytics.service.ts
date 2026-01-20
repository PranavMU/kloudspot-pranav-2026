import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  DwellTimeResponse,
  FootfallResponse,
  OccupancyResponse,
  DemographicsResponse,
  EntryExitResponse,
  PaginationRequest
} from '../interfaces/analytics.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  // Use absolute URL since API allows CORS
  private readonly API_BASE = 'https://hiring-dev.internal.kloudspot.com/api';

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  getAverageDwellTime(siteId: string, fromUtc: number, toUtc: number): Observable<DwellTimeResponse> {
    const body = { siteId, fromUtc, toUtc };
    return this.http.post<DwellTimeResponse>(
      `${this.API_BASE}/analytics/dwell`,
      body,
      { headers: this.getHeaders() }
    );
  }

  getTodayFootfall(siteId: string, fromUtc: number, toUtc: number): Observable<FootfallResponse> {
    const body = { siteId, fromUtc, toUtc };
    return this.http.post<FootfallResponse>(
      `${this.API_BASE}/analytics/footfall`,
      body,
      { headers: this.getHeaders() }
    );
  }

  getOccupancyTimeseries(siteId: string, fromUtc: number, toUtc: number): Observable<OccupancyResponse> {
    const body = { siteId, fromUtc, toUtc };
    return this.http.post<OccupancyResponse>(
      `${this.API_BASE}/analytics/occupancy`,
      body,
      { headers: this.getHeaders() }
    );
  }

  getDemographics(siteId: string, fromUtc: number, toUtc: number): Observable<DemographicsResponse> {
    const body = { siteId, fromUtc, toUtc };
    return this.http.post<DemographicsResponse>(
      `${this.API_BASE}/analytics/demographics`,
      body,
      { headers: this.getHeaders() }
    );
  }

  getEntryExitRecords(request: PaginationRequest): Observable<EntryExitResponse> {
    return this.http.post<EntryExitResponse>(
      `${this.API_BASE}/analytics/entry-exit`,
      request,
      { headers: this.getHeaders() }
    );
  }
}
