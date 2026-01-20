import { Routes } from '@angular/router';
import { LoginComponent } from '../app/login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { CrowdEntriesComponent } from './crowd-entries/crowd-entries.component';
import { authGuard } from '../app/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent,  },
  { path: 'entries', component: CrowdEntriesComponent, },
  { path: '**', redirectTo: '/login' }

  // canActivate: [authGuard] 
];
