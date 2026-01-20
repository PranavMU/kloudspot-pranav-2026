import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../services/analytics.service';
import { AuthService } from '../services/auth.service';
import { SocketService, AlertEvent } from '../services/socket.service';
import { EntryExitRecord } from '../interfaces/analytics.model';
import { format, parseISO } from 'date-fns';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-crowd-entries',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './crowd-entries.component.html',
  styleUrl: './crowd-entries.component.css'
})
export class CrowdEntriesComponent implements OnInit, OnDestroy {
  private analyticsService = inject(AnalyticsService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private subscriptions = new Subscription();

  records = signal<EntryExitRecord[]>([]);
  currentPage = signal(1);
  pageSize = signal(10);
  totalRecords = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);

  // Alerts
  alerts = signal<Array<AlertEvent & { id: string }>>([]);
  showAlertsPanel = signal(false);

  ngOnInit(): void {
    this.loadEntries();
    this.setupSocketListeners();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private setupSocketListeners(): void {
    this.socketService.connect();

    // Listen for alerts
    const alertSub = this.socketService.onAlert().subscribe((event: AlertEvent) => {
      console.log('Alert received:', event);
      const alertWithId = {
        ...event,
        id: `${Date.now()}-${Math.random()}`
      };
      this.alerts.update(alerts => [alertWithId, ...alerts]);
    });
    this.subscriptions.add(alertSub);
  }

  dismissAlert(alertId: string): void {
    this.alerts.update(alerts => alerts.filter(alert => alert.id !== alertId));
  }

  dismissAllAlerts(): void {
    this.alerts.set([]);
  }

  toggleAlertsPanel(): void {
    this.showAlertsPanel.update(value => !value);
  }

  getUnreadAlertCount(): number {
    return this.alerts().length;
  }

  getSeverityColor(severity: 'low' | 'medium' | 'high'): string {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  getSeverityIcon(severity: 'low' | 'medium' | 'high'): string {
    switch (severity) {
      case 'high':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'medium':
        return 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'low':
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }

  formatAlertTime(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  }

  loadEntries(): void {
    this.isLoading.set(true);
    const siteId = this.authService.getStoredSiteId();

    this.analyticsService.getEntryExitRecords({
      pageNumber: this.currentPage(),
      pageSize: this.pageSize(),
      siteId: siteId || undefined
    }).subscribe({
      next: (response) => {
        console.log('Entry Exit API Response:', response);
        if (response && response.records) {
          this.records.set(response.records || []);
          // Handle pagination from root level (actual API structure)
          this.totalRecords.set(response.totalRecords || 0);
          this.totalPages.set(response.totalPages || 0);
        } else {
          console.warn('Unexpected API response structure:', response);
          this.records.set([]);
          this.totalRecords.set(0);
          this.totalPages.set(0);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading entries:', error);
        console.error('Error details:', error.error);
        this.records.set([]);
        this.totalRecords.set(0);
        this.totalPages.set(0);
        this.isLoading.set(false);
      }
    });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadEntries();
    }
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  formatTime(utcTimestamp: number | null | undefined, localTime?: string | null): string {
    if (utcTimestamp === null || utcTimestamp === undefined) {
      return '--';
    }
    try {
      // Use UTC timestamp (epoch milliseconds)
      const date = new Date(utcTimestamp);
      return format(date, 'h:mm a');
    } catch {
      // Fallback to local time string if provided
      if (localTime) {
        try {
          // Extract time from "14/12/2025 16:57:20" format
          const timeMatch = localTime.match(/(\d{2}:\d{2}:\d{2})/);
          if (timeMatch) {
            const [hours, minutes] = timeMatch[1].split(':');
            const hour12 = parseInt(hours) % 12 || 12;
            const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
            return `${hour12}:${minutes} ${ampm}`;
          }
        } catch {
          return localTime;
        }
      }
      return '--';
    }
  }

  formatDwellTime(minutes: number | null | undefined, exitUtc: number | null = null): string {
    // If there's no exit time, show "--"
    if (!exitUtc || minutes === null || minutes === undefined || minutes === 0) {
      return '--';
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  getInitials(name: string | null | undefined): string {
    if (!name) {
      return '??';
    }
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  isString(value: any): boolean {
    return typeof value === 'string';
  }

  goToPageIfNumber(pageNum: number | string): void {
    if (typeof pageNum === 'number') {
      this.goToPage(pageNum);
    }
  }

  getGenderBadgeClass(gender: string): string {
    return gender === 'male' 
      ? 'bg-blue-100 text-blue-800' 
      : 'bg-pink-100 text-pink-800';
  }

  logout(): void {
    this.authService.logout();
  }

  // Expose Math to template
  Math = Math;

  getPageNumbers(): (number | string)[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      if (current > 3) {
        pages.push('...');
      }

      // Show pages around current
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (current < total - 2) {
        pages.push('...');
      }

      // Show last page
      pages.push(total);
    }

    return pages;
  }
}

