import { Injectable, computed, signal } from '@angular/core';

export interface UserSessionProfile {
  id: number;
  nombre: string;
  apellidos: string;
  email: string;
  cargo: string;
  tipo_vacaciones: string;
}

const USER_TOKEN_STORAGE_KEY = 'holidays_tracker_user_session_token';
const USER_PROFILE_STORAGE_KEY = 'holidays_tracker_user_profile';
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

@Injectable({ providedIn: 'root' })
export class UserSessionService {
  readonly currentUser = signal<UserSessionProfile | null>(this.readProfileFromStorage());
  readonly sessionToken = signal<string>(this.readTokenFromStorage());

  readonly isAuthenticated = computed<boolean>(() => Boolean(this.sessionToken()));

  /**
   * Guarda la sesión devuelta por la API:
   * 1. En localStorage para persistencia indefinida sin fecha de caducidad.
   * 2. Como cookie de larga duración en document.cookie (como respaldo a la HttpOnly del servidor).
   * 3. En los signals reactivos de la aplicación.
   */
  saveSession(user: UserSessionProfile, token: string): void {
    this.sessionToken.set(token);
    this.currentUser.set(user);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USER_TOKEN_STORAGE_KEY, token);
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(user));
      }
    } catch {
      // Ignorar errores de escritura en storage
    }

    try {
      if (typeof document !== 'undefined') {
        document.cookie = `ht_session=${encodeURIComponent(
          token
        )}; path=/; max-age=${TEN_YEARS_SECONDS}; SameSite=Lax`;
      }
    } catch {
      // Ignorar errores de cookies
    }
  }

  clearSession(): void {
    this.sessionToken.set('');
    this.currentUser.set(null);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(USER_TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
      }
    } catch {
      // Ignorar
    }

    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'ht_session=; path=/; max-age=0; SameSite=Lax';
      }
    } catch {
      // Ignorar
    }
  }

  private readTokenFromStorage(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(USER_TOKEN_STORAGE_KEY) ?? '';
      }
    } catch {
      // Ignorar
    }
    return '';
  }

  private readProfileFromStorage(): UserSessionProfile | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw) as UserSessionProfile;
        }
      }
    } catch {
      // Ignorar
    }
    return null;
  }
}
