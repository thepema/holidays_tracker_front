import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly password = signal<string>('');
  protected readonly showPassword = signal<boolean>(false);

  readonly loggedIn = output<void>();

  protected submitLogin(): void {
    const pwd = this.password().trim();
    if (!pwd || this.auth.loading()) {
      return;
    }

    this.auth.login(pwd, () => {
      this.password.set('');
      this.loggedIn.emit();
    });
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }
}
