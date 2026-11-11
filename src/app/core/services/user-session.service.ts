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

@Injectable({ providedIn: 'root' })
export class UserSessionService {
  readonly currentUser = signal<UserSessionProfile | null>(this.readProfileFromStorage());
  readonly sessionToken = signal<string>('');

  readonly isAuthenticated = computed<boolean>(() => Boolean(this.sessionToken()));

  constructor() {
    this.clearLegacyClientArtifacts();
  }

  /**
   * Guarda la sesión devuelta por la API:
   * 1. La cookie ht_session (HttpOnly) es gestionada exclusivamente por el backend.
   * 2. El perfil (no sensible) se guarda en localStorage.
   * 3. En los signals reactivos de la aplicación.
   */
  saveSession(user: UserSessionProfile, token = 'cookie-ht-session'): void {
    this.sessionToken.set(token || 'cookie-ht-session');
    this.currentUser.set(user);
    this.clearLegacyClientArtifacts();

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(user));
      }
    } catch {
      // Ignorar errores de escritura en storage
    }
  }

  clearSession(): void {
    this.sessionToken.set('');
    this.currentUser.set(null);
    this.clearLegacyClientArtifacts();

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
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

  /**
   * Elimina cualquier cookie ht_session no-HttpOnly o token en localStorage
   * que hubiera quedado en el dominio del frontend de versiones anteriores.
   */
  private clearLegacyClientArtifacts(): void {
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'ht_session=; path=/; max-age=0; SameSite=Lax';
      }
    } catch {
      // Ignorar
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(USER_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignorar
    }
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
