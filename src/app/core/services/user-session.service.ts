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
   * 1. El token se guarda únicamente en la cookie ht_session (nunca en localStorage).
   *    Si la cookie se pierde, el usuario debe recuperar la sesión.
   * 2. El perfil (no sensible) se guarda en localStorage.
   * 3. En los signals reactivos de la aplicación.
   */
  saveSession(user: UserSessionProfile, token: string): void {
    this.sessionToken.set(token);
    this.currentUser.set(user);

    try {
      if (typeof localStorage !== 'undefined') {
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

  setProfile(user: UserSessionProfile): void {
    this.currentUser.set(user);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(user));
      }
    } catch {
      // Ignorar
    }
  }

  private readTokenFromStorage(): string {
    try {
      if (typeof document !== 'undefined' && document.cookie) {
        const match = document.cookie
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('ht_session='));
        if (match) {
          const cookieVal = decodeURIComponent(match.slice('ht_session='.length)).trim();
          if (cookieVal) {
            return cookieVal;
          }
        }
      }
    } catch {
      // Ignorar
    }

    // Limpia tokens heredados de versiones anteriores que los guardaban en localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(USER_TOKEN_STORAGE_KEY);
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
