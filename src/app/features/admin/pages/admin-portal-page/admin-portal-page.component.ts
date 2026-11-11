import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminStateService } from '../../../../core/services/admin-state.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LoginPageComponent } from '../../../auth/components/login-page/login-page.component';
import { AdminDashboardComponent } from '../admin-dashboard/admin-dashboard.component';

@Component({
  selector: 'app-admin-portal-page',
  standalone: true,
  imports: [LoginPageComponent, AdminDashboardComponent],
  template: `
    @if (!auth.isAuthenticated()) {
      <app-login-page />
    } @else {
      <app-admin-dashboard (logoutRequested)="onLogout()" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPortalPageComponent {
  protected readonly auth = inject(AuthService);
  private readonly adminState = inject(AdminStateService);

  protected onLogout(): void {
    this.auth.logout();
    this.adminState.reset();
  }
}
