import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser, UserFormPayload } from '../models/user.model';

export type { AdminUser, UserFormPayload };

export interface SessionActivationResponse {
  usuario: {
    id: number;
    nombre: string;
    apellidos: string;
    email: string;
    cargo: string;
    tipo_vacaciones: string;
  };
  token: string;
  codigoRecuperacion: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl.replace(/\/$/, '');

  login(password: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/admin/login`, { password });
  }

  /**
   * POST /api/sesiones/activar
   * Activa la sesión con el código de invitación recibido por la URL.
   * Se incluye withCredentials: true para registrar y guardar la cookie ht_session.
   */
  activateSession(codigo: string): Observable<SessionActivationResponse> {
    return this.http.post<SessionActivationResponse>(
      `${this.baseUrl}/api/sesiones/activar`,
      { codigo },
      { withCredentials: true }
    );
  }

  /**
   * GET /api/usuarios (administrador):
   * Obtiene todos los usuarios excluyendo los que tienen cargo de administrador
   * ('Administrador', 'Administradora', 'admin').
   */
  getUsers(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/usuarios`, { headers: this.auth(token) });
  }

  /**
   * GET /api/usuarios/pendientes (administrador):
   * Obtiene todos los datos de los usuarios a los que se les ha enviado la invitación
   * (estado = 'proceso') y aún no han completado la autenticación.
   */
  getPendingUsers(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/usuarios/pendientes`, { headers: this.auth(token) });
  }

  createUser(user: UserFormPayload, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/usuarios`, user, { headers: this.auth(token) });
  }

  updateUser(userId: number, user: Partial<AdminUser>, token?: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/api/usuarios/${userId}`, user, { headers: this.auth(token) });
  }

  getVacations(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/vacaciones`, { headers: this.auth(token) });
  }

  addVacations(usuarioId: number, fechas: string[], token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/vacaciones`, { usuarioId, fechas }, { headers: this.auth(token) });
  }

  sendBulkInvitations(token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/invitaciones`, {}, { headers: this.auth(token) });
  }

  inviteUser(usuarioId: number, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/usuarios/${usuarioId}/invitacion`, {}, { headers: this.auth(token) });
  }

  closeSession(usuarioId: number, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/cerrar`, { usuarioId }, { headers: this.auth(token) });
  }

  requestSession(usuarioId: number, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/solicitar`, { usuarioId }, { headers: this.auth(token) });
  }

  private auth(token?: string): HttpHeaders {
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
