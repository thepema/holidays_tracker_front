import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { asRecord, extractErrorMessage } from '../utils/http-helpers';

const ADMIN_TOKEN_STORAGE_KEY = 'holidays_tracker_admin_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  readonly token = signal<string>(this.readTokenFromSessionStorage());
  readonly loading = signal<boolean>(false);
  readonly loginError = signal<string>('');
  readonly isAuthenticated = computed<boolean>(() => Boolean(this.token()));

  login(password: string, onSuccess?: () => void): void {
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      return;
    }

    this.loginError.set('');
    this.loading.set(true);

    this.api.login(cleanPassword).subscribe({
      next: (result) => {
        const body = asRecord(result);
        const extractedToken = String(body['token'] ?? '').trim();
        if (!extractedToken) {
          this.loginError.set('La respuesta de la API no contiene un token válido.');
          this.loading.set(false);
          return;
        }
        this.saveTokenToSessionStorage(extractedToken);
        this.token.set(extractedToken);
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
    this.removeTokenFromSessionStorage();
    this.token.set('');
    this.loginError.set('');
    this.loading.set(false);
  }

  private readTokenFromSessionStorage(): string {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
      }
    } catch {
      // Ignorar errores de acceso a sessionStorage en contextos restringidos
    }
    return '';
  }

  private saveTokenToSessionStorage(token: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      }
    } catch {
      // Ignorar errores de escritura en sessionStorage
    }
  }

  private removeTokenFromSessionStorage(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignorar errores al limpiar sessionStorage
    }
  }
}
