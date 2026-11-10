import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppModule } from './app.module';
import { AuthService } from './core/services/auth.service';
import { AdminStateService } from './core/services/admin-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly adminState = inject(AdminStateService);

  protected onLogout(): void {
    this.auth.logout();
    this.adminState.reset();
  }
}
