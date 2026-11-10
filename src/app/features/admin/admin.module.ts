import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { AdminHeaderComponent } from './components/admin-header/admin-header.component';
import { ConfirmBulkModalComponent } from './components/confirm-bulk-modal/confirm-bulk-modal.component';
import { SessionRequestsComponent } from './components/session-requests/session-requests.component';
import { TeamPanelComponent } from './components/team-panel/team-panel.component';
import { UserFormModalComponent } from './components/user-form-modal/user-form-modal.component';
import { VacationCalendarComponent } from './components/vacation-calendar/vacation-calendar.component';
import { VacationModalComponent } from './components/vacation-modal/vacation-modal.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';

const ADMIN_COMPONENTS = [
  AdminHeaderComponent,
  VacationCalendarComponent,
  TeamPanelComponent,
  SessionRequestsComponent,
  UserFormModalComponent,
  VacationModalComponent,
  ConfirmBulkModalComponent,
  AdminDashboardComponent,
] as const;

@NgModule({
  imports: [SharedModule, ...ADMIN_COMPONENTS],
  exports: [...ADMIN_COMPONENTS],
})
export class AdminModule {}
