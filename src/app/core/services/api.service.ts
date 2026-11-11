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

  getVacations(token?: string, params?: { mes?: number; anio?: number }): Observable<unknown> {
    const queryParams: Record<string, string> = {};
    if (params?.anio) {
      queryParams['anio'] = String(params.anio);
    }
    if (params?.mes) {
      queryParams['mes'] = String(params.mes);
    }
    return this.http.get(`${this.baseUrl}/api/vacaciones`, {
      headers: this.auth(token),
      params: queryParams,
    });
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

  requestSessionByEmailOrCode(identificador: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/solicitar`, {
      identificador,
      email: identificador,
      codigo: identificador,
    });
  }

  /**
   * GET /api/sesiones/me
   * Verifica la sesión activa del usuario mediante la cookie ht_session / token.
   */
  getCurrentSession(): Observable<{
    autenticado: boolean;
    usuario: SessionActivationResponse['usuario'];
  }> {
    return this.http.get<{
      autenticado: boolean;
      usuario: SessionActivationResponse['usuario'];
    }>(`${this.baseUrl}/api/sesiones/me`, { withCredentials: true });
  }

  /**
   * POST /api/sesiones/recuperar
   * Verifica el token de recuperación y devuelve la cookie de sesión ht_session junto con el usuario.
   */
  recoverSessionWithToken(
    codigoRecuperacion: string,
    email?: string
  ): Observable<SessionActivationResponse> {
    return this.http.post<SessionActivationResponse>(
      `${this.baseUrl}/api/sesiones/recuperar`,
      {
        codigoRecuperacion: codigoRecuperacion.trim(),
        ...(email && email.trim() ? { email: email.trim() } : {}),
      },
      { withCredentials: true }
    );
  }

  /**
   * POST /api/sesiones/solicitar
   * Cruza nombre y correo con la base de datos y registra la sesión como 'solicitado'.
   */
  requestSessionByNameAndEmail(
    nombre: string,
    email: string
  ): Observable<{ solicitado?: boolean; mensaje?: string }> {
    return this.http.post<{ solicitado?: boolean; mensaje?: string }>(
      `${this.baseUrl}/api/sesiones/solicitar`,
      {
        nombre: nombre.trim(),
        email: email.trim(),
      },
      { withCredentials: true }
    );
  }

  /**
   * GET /api/vacaciones (usuario autenticado)
   * Obtiene únicamente las vacaciones solicitadas por el usuario de la sesión activa.
   */
  getUserVacations(): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/vacaciones`, { withCredentials: true });
  }

  /**
   * POST /api/vacaciones (usuario autenticado)
   * Registra nuevas fechas de vacaciones para el usuario de la sesión activa.
   */
  saveUserVacations(fechas: string[]): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/api/vacaciones`,
      { fechas },
      { withCredentials: true }
    );
  }

  /**
   * PATCH /api/vacaciones/:vacacionId (usuario autenticado)
   * Modifica la fecha de un día de vacaciones solicitado si aún no ha pasado la fecha.
   */
  updateUserVacationDate(vacacionId: number, fecha: string): Observable<unknown> {
    return this.http.patch(
      `${this.baseUrl}/api/vacaciones/${vacacionId}`,
      { fecha },
      { withCredentials: true }
    );
  }

  /**
   * DELETE /api/vacaciones/:vacacionId (usuario autenticado)
   * Elimina / cancela un día de vacaciones solicitado si aún no ha pasado la fecha.
   */
  deleteUserVacation(vacacionId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/api/vacaciones/${vacacionId}`, {
      withCredentials: true,
    });
  }

  private auth(token?: string): HttpHeaders {
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
