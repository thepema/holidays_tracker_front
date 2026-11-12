import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { AdminHeaderComponent } from './components/admin-header/admin-header.component';
import { ConfirmBulkModalComponent } from './components/confirm-bulk-modal/confirm-bulk-modal.component';
import { ExportExcelModalComponent } from './components/export-excel-modal/export-excel-modal.component';
import { SessionRequestsComponent } from './components/session-requests/session-requests.component';
import { TeamPanelComponent } from './components/team-panel/team-panel.component';
import { TeamsModalComponent } from './components/teams-modal/teams-modal.component';
import { UserFormModalComponent } from './components/user-form-modal/user-form-modal.component';
import { VacationCalendarComponent } from './components/vacation-calendar/vacation-calendar.component';
import { VacationModalComponent } from './components/vacation-modal/vacation-modal.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { AdminPortalPageComponent } from './pages/admin-portal-page/admin-portal-page.component';

const ADMIN_COMPONENTS = [
  AdminHeaderComponent,
  VacationCalendarComponent,
  TeamPanelComponent,
  TeamsModalComponent,
  SessionRequestsComponent,
  UserFormModalComponent,
  VacationModalComponent,
  ConfirmBulkModalComponent,
  ExportExcelModalComponent,
  AdminDashboardComponent,
  AdminPortalPageComponent,
] as const;

@NgModule({
  imports: [SharedModule, AuthModule, ...ADMIN_COMPONENTS],
  exports: [...ADMIN_COMPONENTS],
})
export class AdminModule {}
