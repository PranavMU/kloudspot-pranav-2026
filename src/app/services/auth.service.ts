import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { LoginRequest, LoginResponse, Site } from '../interfaces/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly API_BASE = 'https://hiring-dev.internal.kloudspot.com/api';
  private readonly TOKEN_KEY = 'auth_token';
  private readonly SITE_ID_KEY = 'site_id';

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_BASE}/auth/login`, credentials).pipe(
      tap(response => {
        localStorage.setItem(this.TOKEN_KEY, response.token);
        this.getSiteId();
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.SITE_ID_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getSiteId(): void {
    this.http.get<Site[]>(`${this.API_BASE}/sites`).subscribe({
      next: (sites) => {
        if (sites && sites.length > 0) {
          const siteId = sites[0].siteId;
          localStorage.setItem(this.SITE_ID_KEY, siteId);
        }
      },
      error: (error) => {
        console.error('Error fetching site ID:', error);
      }
    });
  }

  getStoredSiteId(): string | null {
    return localStorage.getItem(this.SITE_ID_KEY);
  }
}
