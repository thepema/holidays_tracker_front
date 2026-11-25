import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { UserStateService } from '../../../../core/services/user-state.service';
import { LandingPageComponent } from '../landing-page/landing-page.component';
import { UserDashboardComponent } from '../user-dashboard/user-dashboard.component';

@Component({
  selector: 'app-user-portal-page',
  standalone: true,
  imports: [LandingPageComponent, UserDashboardComponent],
  template: `
    @if (state.checkingCookie()) {
      <div class="portal-checking">
        <div class="portal-spinner"></div>
      </div>
    } @else if (!state.isAuthenticated()) {
      <app-landing-page (sessionRecovered)="onSessionRecovered()" />
    } @else {
      <app-user-dashboard (sessionExpired)="onSessionExpired()" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
    .portal-checking {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg-app);
    }
    .portal-spinner {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 3px solid var(--accent-soft);
      border-top-color: var(--accent-primary);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPortalPageComponent implements OnInit {
  protected readonly state = inject(UserStateService);

  ngOnInit(): void {
    this.state.verifyInitialCookieSession();
  }

  protected onSessionRecovered(): void {
    this.state.onSessionRecovered();
  }

  protected onSessionExpired(): void {
    this.state.expireSession();
  }
}
