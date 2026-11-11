import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ApiService } from '../../../../core/services/api.service';
import { UserSessionService } from '../../../../core/services/user-session.service';
import { LandingPageComponent } from '../landing-page/landing-page.component';
import { UserDashboardComponent } from '../user-dashboard/user-dashboard.component';

@Component({
  selector: 'app-user-portal-page',
  standalone: true,
  imports: [LandingPageComponent, UserDashboardComponent],
  template: `
    @if (checkingCookie()) {
      <div class="portal-checking">
        <div class="portal-spinner"></div>
      </div>
    } @else if (!userSession.isAuthenticated()) {
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
  protected readonly userSession = inject(UserSessionService);
  private readonly api = inject(ApiService);

  protected readonly checkingCookie = signal<boolean>(false);

  ngOnInit(): void {
    if (!this.userSession.isAuthenticated()) {
      // Comprobar si existe una cookie ht_session HttpOnly válida en el navegador
      this.checkingCookie.set(true);
      this.api.getCurrentSession().subscribe({
        next: (res) => {
          if (res?.autenticado && res?.usuario) {
            this.userSession.saveSession(res.usuario, 'cookie-ht-session');
          }
          this.checkingCookie.set(false);
        },
        error: () => {
          this.checkingCookie.set(false);
        },
      });
    }
  }

  protected onSessionRecovered(): void {
    this.checkingCookie.set(false);
  }

  protected onSessionExpired(): void {
    this.userSession.clearSession();
  }
}
