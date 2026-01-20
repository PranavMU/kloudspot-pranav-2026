import { Component, OnInit, OnDestroy, signal, inject, ChangeDetectorRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { BaseChartDirective } from 'ng2-charts';
import { AnalyticsService } from '../services/analytics.service';
import { SocketService, LiveOccupancyEvent, AlertEvent } from '../services/socket.service';
import { AuthService } from '../services/auth.service';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChartConfiguration, ChartOptions, Chart } from 'chart.js';

export const liveLinePlugin = {
  id: 'liveLine',
  afterDraw(chart: any) {
    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    if (!xScale) return;

    const liveIndex = 8; // 16:00
    const x = xScale.getPixelForValue(liveIndex);
    if (!x) return;

    ctx.save();
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();

    ctx.setLineDash([]);

    const w = 30;
    const h = 14;
    const y = chartArea.top - h - 6;

    ctx.fillStyle = '#DC2626';
    ctx.fillRect(x - w / 2, y, w, h);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIVE', x, y + h / 2);

    ctx.restore();
  }
};

Chart.register(liveLinePlugin);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private analyticsService = inject(AnalyticsService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private subscriptions = new Subscription();

  @ViewChild('occupancyChart') occupancyChart?: BaseChartDirective;
  @ViewChild('demographicsChart') demographicsChart?: BaseChartDirective;
  @ViewChild('demographicsDoughnutChart') demographicsDoughnutChart?: BaseChartDirective;

  // Metrics
  liveOccupancy = signal(0);
  todayFootfall = signal(0);
  averageDwellTime = signal(0);
  dwellTimeUnit = signal('minutes');
  
  // Comparisons
  occupancyComparison = signal<{ change: number; changePercent: number } | null>(null);
  footfallComparison = signal<{ change: number; changePercent: number } | null>(null);
  dwellTimeComparison = signal<{ change: number; changePercent: number } | null>(null);

  // Demographics
  currentDemographics = signal({ male: 0, female: 0 });

  // Alerts
  alerts = signal<Array<AlertEvent & { id: string; dismissed?: boolean }>>([]);
  showAlertsPanel = signal(false);

  // Chart data - using signals for reactivity

 occupancyChartData = signal<ChartConfiguration<'line'>['data']>({
    labels: [
      '8:00','9:00','10:00','11:00','12:00',
      '13:00','14:00','15:00','16:00','17:00','18:00'
    ],
    datasets: [
      {
        label: 'Occupancy',
        data: [150, 155, 160, 170, 165, 175, 180, 175, 185, null, null],
        borderColor: '#2CB1B0',
        backgroundColor: 'rgba(44,177,176,0.12)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2
      }
    ]
  });

occupancyChartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: {
        color: '#E5E7EB',
        borderDash: [4, 4]
      } as any
    },
    y: {
      grid: {
        color: '#E5E7EB',
        borderDash: [4, 4]
      } as any
    }
  }
};

  demographicsChartData = signal<ChartConfiguration<'line'>['data']>({
    labels: [],
    datasets: [
      {
        label: 'Male',
        data: [],
       
        backgroundColor: ['#7FB8B6'],
        tension: 0.4,
        fill: true
      },
      {
        label: 'Female',
        data: [],
      
        backgroundColor:  ['#BFE3E1'],
        tension: 0.4,
        fill: true
      }
    ]
  });

demographicsDoughnutChartData = signal<ChartConfiguration<'doughnut'>['data']>({
  labels: ['Male', 'Female'],
  datasets: [
    {
      data: [55, 45], // Figma values
      backgroundColor: ['#7FB8B6', '#BFE3E1'],
      borderWidth: 0,
      spacing: 6,          // ✅ gap between segments (Figma-like)
      hoverOffset: 0       // ✅ no hover pop
    }
  ]
});




  demographicsChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

demographicsDoughnutChartOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '72%',          // ✅ ring thickness (matches Figma)
  rotation: -90,          // ✅ starts at top
  circumference: 360,     // full circle
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false }
  }
};


  isLoading = signal(true);

  ngOnInit(): void {
    const siteId = this.authService.getStoredSiteId();
    this.loadDashboardData(siteId || undefined);
    this.setupSocketListeners();
  }

  ngAfterViewInit(): void {
    // Charts will be updated when data loads
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.socketService.disconnect();
  }

  private loadDashboardData(siteId?: string): void {
    if (!siteId) {
      console.error('Site ID is required');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    // Calculate time ranges (last 24 hours for dashboard)
    // API expects UTC epoch-millis
    const now = new Date();
    const toUtc = now.getTime(); // Current time in epoch-millis (UTC)
    const fromUtc = now.getTime() - (24 * 60 * 60 * 1000); // 24 hours ago

    // Load footfall data (for today in UTC)
    const nowUtc = new Date();
    const todayStart = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), 23, 59, 59, 999));
    const todayFromUtc = todayStart.getTime();
    const todayToUtc = todayEnd.getTime();

    // Use forkJoin to wait for all API calls to complete
    forkJoin({
      occupancy: this.analyticsService.getOccupancyTimeseries(siteId, fromUtc, toUtc).pipe(
        catchError(error => {
          console.error('Error loading occupancy:', error);
          console.error('Error status:', error.status);
          console.error('Error message:', error.message);
          console.error('Error details:', error.error);
          return of(null);
        })
      ),
      footfall: this.analyticsService.getTodayFootfall(siteId, todayFromUtc, todayToUtc).pipe(
        catchError(error => {
          console.error('Error loading footfall:', error);
          console.error('Error status:', error.status);
          console.error('Error message:', error.message);
          console.error('Error details:', error.error);
          return of(null);
        })
      ),
      dwellTime: this.analyticsService.getAverageDwellTime(siteId, fromUtc, toUtc).pipe(
        catchError(error => {
          console.error('Error loading dwell time:', error);
          console.error('Error status:', error.status);
          console.error('Error message:', error.message);
          console.error('Error details:', error.error);
          return of(null);
        })
      ),
      demographics: this.analyticsService.getDemographics(siteId, fromUtc, toUtc).pipe(
        catchError(error => {
          console.error('Error loading demographics:', error);
          console.error('Error status:', error.status);
          console.error('Error message:', error.message);
          console.error('Error details:', error.error);
          return of(null);
        })
      )
    }).subscribe({
      next: (results) => {
        // Process occupancy data
        if (results.occupancy) {
          console.log('Occupancy API Response:', results.occupancy);
          const response = results.occupancy as any;
          
          // Handle buckets format (actual API response)
          if (response.buckets && Array.isArray(response.buckets) && response.buckets.length > 0) {
            const buckets = response.buckets;
            // Get latest occupancy value for current occupancy
            const latestBucket = buckets[buckets.length - 1];
            const occupancy = latestBucket?.avg ?? 0;
            this.liveOccupancy.set(occupancy);
            
            // Update chart with buckets data
            const labels = buckets.map((bucket: any) => {
              const timestamp = bucket.utc || bucket.local;
              return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            });
            const values = buckets.map((bucket: any) => bucket.avg ?? 0);
            
            this.occupancyChartData.set({
              labels,
              datasets: [{
                label: 'Occupancy',
                data: values,
                borderColor: 'rgb(14, 165, 233)',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                tension: 0.4,
                fill: true
              }]
            });
            this.cdr.detectChanges();
          } 
          // Fallback to timeseries format (if API changes)
          else if (results.occupancy.timeseries && Array.isArray(results.occupancy.timeseries) && results.occupancy.timeseries.length > 0) {
            const timeseries = results.occupancy.timeseries;
            const occupancy = response.currentOccupancy ?? response.occupancy ?? (timeseries.length > 0 ? timeseries[timeseries.length - 1]?.occupancy : 0);
            this.liveOccupancy.set(occupancy);
            
            const labels = timeseries.map(point => {
              const pointAny = point as any;
              const timestamp = point.timestamp || pointAny.time || pointAny.date;
              return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            });
            const values = timeseries.map(point => {
              const pointAny = point as any;
              return point.occupancy || pointAny.count || 0;
            });
            
            this.occupancyChartData.set({
              labels,
              datasets: [{
                label: 'Occupancy',
                data: values,
                borderColor: 'rgb(14, 165, 233)',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                tension: 0.4,
                fill: true
              }]
            });
            this.cdr.detectChanges();
            // Force chart update
            setTimeout(() => {
              this.occupancyChart?.chart?.update();
            }, 0);
          } else {
            console.warn('No buckets or timeseries data found in occupancy response');
            this.liveOccupancy.set(0);
          }
          
          if (results.occupancy.comparison) {
            this.occupancyComparison.set({
              change: results.occupancy.comparison.change,
              changePercent: results.occupancy.comparison.changePercent
            });
          }
        } else {
          this.liveOccupancy.set(0);
        }

        // Process footfall data
        if (results.footfall) {
          console.log('Footfall API Response:', results.footfall);
          const response = results.footfall as any;
          const footfall = results.footfall.footfall ?? response.todayFootfall ?? response.count ?? 0;
          this.todayFootfall.set(footfall);
        } else {
          this.todayFootfall.set(0);
        }

        // Process dwell time data
        if (results.dwellTime) {
          console.log('Dwell Time API Response:', results.dwellTime);
          const response = results.dwellTime as any;
          // API returns avgDwellMinutes (not averageDwellTime)
          const dwellTime = response.avgDwellMinutes ?? results.dwellTime.averageDwellTime ?? response.dwellTime ?? response.avgDwellTime ?? 0;
          this.averageDwellTime.set(dwellTime);
          // API doesn't return unit, it's always minutes
          this.dwellTimeUnit.set('minutes');
          if (results.dwellTime.comparison) {
            this.dwellTimeComparison.set({
              change: results.dwellTime.comparison.change,
              changePercent: results.dwellTime.comparison.changePercent
            });
          }
        } else {
          this.averageDwellTime.set(0);
          this.dwellTimeUnit.set('minutes');
        }

        // Process demographics data
        if (results.demographics) {
          console.log('Demographics API Response:', results.demographics);
          const response = results.demographics as any;
          
          // Handle buckets format (actual API response)
          if (response.buckets && Array.isArray(response.buckets) && response.buckets.length > 0) {
            const buckets = response.buckets;
            // Get latest bucket for current demographics
            const latestBucket = buckets[buckets.length - 1];
            const maleValue = latestBucket?.male ?? 0;
            const femaleValue = latestBucket?.female ?? 0;
            this.currentDemographics.set({
              male: maleValue,
              female: femaleValue
            });
            
            // Update doughnut chart
            const total = maleValue + femaleValue;
            this.demographicsDoughnutChartData.set({
              labels: ['Male', 'Female'],
              datasets: [{
                data: [maleValue, femaleValue],
                backgroundColor: ['rgb(59, 130, 246)', 'rgb(236, 72, 153)'],
                borderWidth: 0
              }]
            });
            
            // Update chart with buckets data
            const labels = buckets.map((bucket: any) => {
              const timestamp = bucket.utc || bucket.local;
              return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            });
            const maleValues = buckets.map((bucket: any) => bucket.male ?? 0);
            const femaleValues = buckets.map((bucket: any) => bucket.female ?? 0);
            
            this.demographicsChartData.set({
              labels,
              datasets: [
                {
                  label: 'Male',
                  data: maleValues,
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.4,
                  fill: true
                },
                {
                  label: 'Female',
                  data: femaleValues,
                  borderColor: 'rgb(236, 72, 153)',
                  backgroundColor: 'rgba(236, 72, 153, 0.1)',
                  tension: 0.4,
                  fill: true
                }
              ]
            });
            this.cdr.detectChanges();
            // Force chart update
            setTimeout(() => {
              this.demographicsDoughnutChart?.chart?.update();
            }, 0);
          }
          // Fallback to timeseries format (if API changes)
          else if (results.demographics.timeseries && Array.isArray(results.demographics.timeseries) && results.demographics.timeseries.length > 0) {
            const timeseries = results.demographics.timeseries;
            const current = results.demographics.current ?? { male: 0, female: 0 };
            const maleValue = current.male ?? 0;
            const femaleValue = current.female ?? 0;
            this.currentDemographics.set({
              male: maleValue,
              female: femaleValue
            });
            
            // Update doughnut chart
            const total = maleValue + femaleValue;
            this.demographicsDoughnutChartData.set({
              labels: ['Male', 'Female'],
              datasets: [{
                data: [maleValue, femaleValue],
                backgroundColor: ['rgb(59, 130, 246)', 'rgb(236, 72, 153)'],
                borderWidth: 0
              }]
            });
            
            const labels = timeseries.map(point => {
              const pointAny = point as any;
              const timestamp = point.timestamp || pointAny.time || pointAny.date;
              return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            });
            const maleValues = timeseries.map(point => point.male ?? 0);
            const femaleValues = timeseries.map(point => point.female ?? 0);
            
            this.demographicsChartData.set({
              labels,
              datasets: [
                {
                  label: 'Male',
                  data: maleValues,
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.4,
                  fill: true
                },
                {
                  label: 'Female',
                  data: femaleValues,
                  borderColor: 'rgb(236, 72, 153)',
                  backgroundColor: 'rgba(236, 72, 153, 0.1)',
                  tension: 0.4,
                  fill: true
                }
              ]
            });
            this.cdr.detectChanges();
            // Force chart update
            setTimeout(() => {
              this.demographicsChart?.chart?.update();
              this.demographicsDoughnutChart?.chart?.update();
            }, 0);
          } else {
            console.warn('No buckets or timeseries data found in demographics response');
            this.currentDemographics.set({ male: 0, female: 0 });
          }
        } else {
          this.currentDemographics.set({ male: 0, female: 0 });
        }

        this.isLoading.set(false);
        
        // Ensure charts are updated after all data is loaded
        setTimeout(() => {
          this.occupancyChart?.chart?.update('none');
          this.demographicsChart?.chart?.update('none');
          this.demographicsDoughnutChart?.chart?.update('none');
        }, 100);
      },
      error: (error) => {
        console.error('Error loading dashboard data:', error);
        this.isLoading.set(false);
      }
    });
  }

  private setupSocketListeners(): void {
    this.socketService.connect();

    // Listen for live occupancy updates
    const occupancySub = this.socketService.onLiveOccupancy().subscribe((event: LiveOccupancyEvent) => {
      this.liveOccupancy.set(event.occupancy);
    });
    this.subscriptions.add(occupancySub);

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

  logout(): void {
    this.authService.logout();
  }

  formatDwellTime(minutes: number, unit: string): string {
    if (unit === 'hours') {
      return `${minutes.toFixed(1)} hrs`;
    }
    // Format as "08min 30sec" style
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins.toString().padStart(2, '0')}min ${secs.toString().padStart(2, '0')}sec`;
  }

  getTotalCrowd(): number {
    const demo = this.currentDemographics();
    return demo.male + demo.female;
  }

  getMalePercentage(): number {
    const total = this.getTotalCrowd();
    if (total === 0) return 0;
    return Math.round((this.currentDemographics().male / total) * 100);
  }

  getFemalePercentage(): number {
    const total = this.getTotalCrowd();
    if (total === 0) return 0;
    return Math.round((this.currentDemographics().female / total) * 100);
  }

  // Expose Math to template
  Math = Math;
}

