import { Injectable, computed, signal } from '@angular/core';

export interface UserSessionProfile {
  id: number;
  codigo?: string;
  nombre: string;
  apellidos: string;
  email: string;
  cargo: string;
  tipo_vacaciones: string;
  oficinaId?: number | null;
  oficinaNombre?: string | null;
}

@Injectable({ providedIn: 'root' })
export class UserSessionService {
  readonly currentUser = signal<UserSessionProfile | null>(null);
  readonly sessionToken = signal<string>('');

  readonly isAuthenticated = computed<boolean>(() => Boolean(this.sessionToken()));

  constructor() {   
  }

  saveSession(user: UserSessionProfile, token = 'cookie-ht-session'): void {
    this.sessionToken.set(token || 'cookie-ht-session');
    this.currentUser.set(user);
  }

  clearSession(): void {
    this.sessionToken.set('');
    this.currentUser.set(null);
  }

  setProfile(user: UserSessionProfile): void {
    this.currentUser.set(user);
  }
}
