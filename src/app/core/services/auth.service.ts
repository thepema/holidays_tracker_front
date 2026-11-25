import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { extractErrorMessage } from '../utils/http-helpers';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  readonly token = this.api.adminToken;
  readonly loading = signal<boolean>(false);
  readonly loginError = signal<string>('');
  readonly isAuthenticated = computed<boolean>(() => Boolean(this.token()));

  public login(password: string, onSuccess?: () => void): void {
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      return;
    }

    this.loginError.set('');
    this.loading.set(true);

    this.api.login(cleanPassword).subscribe({
      next: (result) => {
        const extractedToken = (result?.token ?? '').trim();
        if (!extractedToken || !this.api.setAdminToken(extractedToken)) {
          this.loginError.set('La respuesta de la API no contiene un token válido.');
          this.loading.set(false);
          return;
        }
        this.loading.set(false);
        onSuccess?.();
      },
      error: (error: unknown) => {
        this.loginError.set(
          extractErrorMessage(
            error,
            'No se pudo iniciar sesión. Comprueba la contraseña e inténtalo de nuevo.'
          )
        );
        this.loading.set(false);
      },
    });
  }

  logout(): void {
    this.api.clearAdminToken();
    this.loginError.set('');
    this.loading.set(false);
  }
}
