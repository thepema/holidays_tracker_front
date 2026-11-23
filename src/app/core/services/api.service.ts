import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser, UserFormPayload } from '../models/user.model';

export type { AdminUser, UserFormPayload };

/**
 * Respuesta devuelta por el backend al activar o recuperar una sesión de usuario.
 */
export interface SessionActivationResponse {
  /** Datos del perfil del usuario autenticado. */
  usuario: {
    id: number;
    codigo?: string;
    nombre: string;
    apellidos: string;
    email: string;
    cargo: string;
    tipo_vacaciones: string;
    oficinaId?: number | null;
    oficinaNombre?: string | null;
  };
  /** Token de sesión asociado al usuario. */
  token: string;
  /** Código personal de recuperación para restaurar la sesión en otro navegador. */
  codigoRecuperacion: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = this.resolveBaseUrl();

  /**
   * POST /api/admin/login
   * Inicia sesión como administrador validando la contraseña proporcionada.
   *
   * @param password Contraseña de administrador.
   * @returns Observable con la respuesta de autenticación (incluyendo el token Bearer).
   */
  login(password: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/admin/login`, { password });
  }

  /**
   * POST /api/sesiones/activar
   * Activa la sesión con el código de invitación recibido por la URL.
   * Se incluye `withCredentials: true` para registrar y guardar la cookie `ht_session`.
   *
   * @param codigo Código de invitación del usuario.
   * @returns Observable con los datos del usuario, el token de sesión y el código de recuperación.
   */
  activateSession(codigo: string): Observable<SessionActivationResponse> {
    return this.http.post<SessionActivationResponse>(
      `${this.baseUrl}/api/sesiones/activar`,
      { codigo },
      { withCredentials: true }
    );
  }

  /**
   * GET /api/usuarios (administrador)
   * Obtiene todos los usuarios excluyendo los que tienen cargo de administrador
   * ('Administrador', 'Administradora', 'admin').
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el listado de usuarios registrados.
   */
  getUsers(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/usuarios`, { headers: this.auth(token) });
  }

  /**
   * GET /api/usuarios/pendientes (administrador)
   * Obtiene todos los datos de los usuarios a los que se les ha enviado la invitación
   * (estado = 'proceso') y aún no han completado la autenticación.
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la lista de usuarios pendientes de activación.
   */
  getPendingUsers(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/usuarios/pendientes`, { headers: this.auth(token) });
  }

  /**
   * POST /api/usuarios (administrador)
   * Crea un nuevo usuario en el sistema.
   *
   * @param user Datos del usuario a crear.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la respuesta de creación del usuario.
   */
  createUser(user: UserFormPayload, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/usuarios`, user, { headers: this.auth(token) });
  }

  /**
   * PATCH /api/usuarios/:userId (administrador)
   * Actualiza parcialmente los datos de un usuario existente.
   *
   * @param userId Identificador del usuario a modificar.
   * @param user Campos parciales del usuario a actualizar.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el usuario actualizado.
   */
  updateUser(userId: number, user: Partial<AdminUser>, token?: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/api/usuarios/${userId}`, user, { headers: this.auth(token) });
  }

  /**
   * GET /api/equipos (administrador)
   * Obtiene el listado completo de equipos registrados.
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la lista de equipos.
   */
  getTeams(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/equipos`, { headers: this.auth(token) });
  }

  /**
   * POST /api/equipos (administrador)
   * Crea un nuevo equipo y opcionalmente le asigna usuarios iniciales.
   *
   * @param payload Nombre del equipo y lista opcional de IDs de usuarios.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el equipo creado.
   */
  createTeam(
    payload: { nombre: string; usuarioIds?: number[] },
    token?: string
  ): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/equipos`, payload, { headers: this.auth(token) });
  }

  /**
   * PATCH /api/equipos/:equipoId (administrador)
   * Modifica el nombre o los miembros asignados a un equipo.
   *
   * @param equipoId Identificador del equipo a actualizar.
   * @param payload Campos a modificar (nombre y/o lista de IDs de usuarios).
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el equipo actualizado.
   */
  updateTeam(
    equipoId: number,
    payload: { nombre?: string; usuarioIds?: number[] },
    token?: string
  ): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/api/equipos/${equipoId}`, payload, {
      headers: this.auth(token),
    });
  }

  /**
   * DELETE /api/equipos/:equipoId (administrador)
   * Elimina un equipo existente del sistema.
   *
   * @param equipoId Identificador del equipo a eliminar.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteTeam(equipoId: number, token?: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/api/equipos/${equipoId}`, {
      headers: this.auth(token),
    });
  }

  /**
   * GET /api/oficinas (administrador)
   * Obtiene todas las oficinas junto con sus usuarios, calendarios y festivos.
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la lista de oficinas.
   */
  getOffices(token?: string): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/oficinas`, { headers: this.auth(token) });
  }

  /**
   * POST /api/oficinas (administrador)
   * Crea una nueva oficina y opcionalmente vincula usuarios iniciales.
   *
   * @param payload Nombre de la oficina y lista opcional de IDs de usuarios.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la oficina creada.
   */
  createOffice(
    payload: { nombre: string; usuarioIds?: number[] },
    token?: string
  ): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/oficinas`, payload, { headers: this.auth(token) });
  }

  /**
   * PATCH /api/oficinas/:oficinaId (administrador)
   * Actualiza el nombre o los usuarios asignados a una oficina.
   *
   * @param oficinaId Identificador de la oficina a modificar.
   * @param payload Campos a actualizar (nombre y/o lista de IDs de usuarios).
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la oficina actualizada.
   */
  updateOffice(
    oficinaId: number,
    payload: { nombre?: string; usuarioIds?: number[] },
    token?: string
  ): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/api/oficinas/${oficinaId}`, payload, {
      headers: this.auth(token),
    });
  }

  /**
   * DELETE /api/oficinas/:oficinaId (administrador)
   * Elimina una oficina existente junto con sus calendarios y festivos asociados.
   *
   * @param oficinaId Identificador de la oficina a eliminar.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteOffice(oficinaId: number, token?: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/api/oficinas/${oficinaId}`, {
      headers: this.auth(token),
    });
  }

  /**
   * POST /api/oficinas/:oficinaId/calendarios (administrador)
   * Habilita un calendario laboral anual para una oficina concreta.
   *
   * @param oficinaId Identificador de la oficina.
   * @param anio Año del calendario a crear.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el calendario creado.
   */
  createOfficeCalendar(oficinaId: number, anio: number, token?: string): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/api/oficinas/${oficinaId}/calendarios`,
      { anio },
      { headers: this.auth(token) }
    );
  }

  /**
   * DELETE /api/oficinas/:oficinaId/calendarios/:calendarioId (administrador)
   * Elimina un calendario anual de una oficina junto con sus días festivos.
   *
   * @param oficinaId Identificador de la oficina.
   * @param calendarioId Identificador del calendario anual a eliminar.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteOfficeCalendar(
    oficinaId: number,
    calendarioId: number,
    token?: string
  ): Observable<unknown> {
    return this.http.delete(
      `${this.baseUrl}/api/oficinas/${oficinaId}/calendarios/${calendarioId}`,
      { headers: this.auth(token) }
    );
  }

  /**
   * POST /api/oficinas/:oficinaId/festivos (administrador)
   * Añade un día festivo al calendario de una oficina.
   *
   * @param oficinaId Identificador de la oficina.
   * @param payload Datos del festivo (fecha en formato `YYYY-MM-DD`, nombre y año opcional).
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el festivo registrado.
   */
  addOfficeHoliday(
    oficinaId: number,
    payload: { fecha: string; nombre: string; anio?: number },
    token?: string
  ): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/oficinas/${oficinaId}/festivos`, payload, {
      headers: this.auth(token),
    });
  }

  /**
   * DELETE /api/oficinas/:oficinaId/festivos/:festivoId (administrador)
   * Elimina un día festivo registrado en una oficina.
   *
   * @param oficinaId Identificador de la oficina.
   * @param festivoId Identificador del festivo a eliminar.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteOfficeHoliday(
    oficinaId: number,
    festivoId: number,
    token?: string
  ): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/api/oficinas/${oficinaId}/festivos/${festivoId}`, {
      headers: this.auth(token),
    });
  }

  /**
   * GET /api/vacaciones (administrador)
   * Obtiene las vacaciones registradas, con filtros opcionales por mes, año y equipo.
   *
   * @param token Token Bearer de administrador opcional.
   * @param params Filtros opcionales (`mes`, `anio`, `equipoId`).
   * @returns Observable con las vacaciones filtradas.
   */
  getVacations(
    token?: string,
    params?: { mes?: number; anio?: number; equipoId?: number | null }
  ): Observable<unknown> {
    const queryParams: Record<string, string> = {};
    if (params?.anio) {
      queryParams['anio'] = String(params.anio);
    }
    if (params?.mes) {
      queryParams['mes'] = String(params.mes);
    }
    if (params?.equipoId) {
      queryParams['equipoId'] = String(params.equipoId);
    }
    return this.http.get(`${this.baseUrl}/api/vacaciones`, {
      headers: this.auth(token),
      params: queryParams,
    });
  }

  /**
   * POST /api/vacaciones (administrador)
   * Registra una o varias fechas de vacaciones para un usuario concreto.
   *
   * @param usuarioId Identificador del usuario.
   * @param fechas Lista de fechas en formato `YYYY-MM-DD`.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el resultado del registro de vacaciones.
   */
  addVacations(usuarioId: number, fechas: string[], token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/vacaciones`, { usuarioId, fechas }, { headers: this.auth(token) });
  }

  /**
   * DELETE /api/vacaciones/:vacacionId (administrador)
   * Elimina un día de vacaciones registrado desde el panel de administración.
   *
   * @param vacacionId Identificador del registro de vacación a eliminar.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteVacationAdmin(vacacionId: number, token?: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/api/vacaciones/${vacacionId}`, {
      headers: this.auth(token),
    });
  }

  /**
   * POST /api/vacaciones/recordatorio (administrador)
   * Envía un correo de recordatorio a todos los usuarios autenticados para que registren
   * sus vacaciones previstas en los próximos meses.
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el resumen del envío (`total`, `enviadas`, `fallidas`).
   */
  sendVacationReminders(token?: string): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/api/vacaciones/recordatorio`,
      {},
      { headers: this.auth(token) }
    );
  }

  /**
   * POST /api/sesiones/invitaciones (administrador)
   * Envía de forma masiva enlaces de invitación a los usuarios pendientes de activación.
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con el resultado del envío masivo de invitaciones.
   */
  sendBulkInvitations(token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/invitaciones`, {}, { headers: this.auth(token) });
  }

  /**
   * POST /api/usuarios/:usuarioId/invitacion (administrador)
   * Envía o reenvía una invitación individual de acceso a un usuario.
   *
   * @param usuarioId Identificador del usuario destinatario.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación del envío.
   */
  inviteUser(usuarioId: number, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/usuarios/${usuarioId}/invitacion`, {}, { headers: this.auth(token) });
  }

  /**
   * POST /api/sesiones/cerrar (administrador)
   * Revoca la sesión activa y el código de recuperación de un usuario.
   *
   * @param usuarioId Identificador del usuario cuya sesión se cerrará.
   * @param token Token Bearer de administrador opcional.
   * @returns Observable con la confirmación del cierre de sesión.
   */
  closeSession(usuarioId: number, token?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/cerrar`, { usuarioId }, { headers: this.auth(token) });
  }

  /**
   * POST /api/sesiones/solicitar
   * Solicita una nueva invitación de sesión usando el correo electrónico o código del usuario.
   *
   * @param identificador Correo electrónico o código identificador del usuario.
   * @returns Observable con la respuesta de la solicitud de sesión.
   */
  requestSessionByEmailOrCode(identificador: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/api/sesiones/solicitar`, {
      identificador,
      email: identificador,
      codigo: identificador,
    });
  }

  /**
   * GET /api/sesiones/me
   * Verifica la sesión activa del usuario mediante la cookie `ht_session` / token.
   *
   * @returns Observable con el estado de autenticación y el perfil del usuario.
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
   * Verifica el token de recuperación y devuelve la cookie de sesión `ht_session` junto con el usuario.
   *
   * @param codigoRecuperacion Código o token de recuperación guardado por el usuario.
   * @param email Correo electrónico opcional para reforzar la verificación.
   * @returns Observable con los datos del usuario, el token de sesión y el código de recuperación.
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
   * Verifica el correo con la base de datos y envía un código numérico de verificación por email.
   *
   * @param email Correo electrónico corporativo del usuario.
   * @returns Observable indicando si requiere verificación, si fue solicitado y un mensaje informativo.
   */
  requestSessionByEmail(
    email: string
  ): Observable<{ requiereVerificacion?: boolean; solicitado?: boolean; mensaje?: string }> {
    return this.http.post<{
      requiereVerificacion?: boolean;
      solicitado?: boolean;
      mensaje?: string;
    }>(
      `${this.baseUrl}/api/sesiones/solicitar`,
      {
        email: email.trim(),
      },
      { withCredentials: true }
    );
  }

  /**
   * POST /api/sesiones/solicitar/confirmar
   * Verifica el código numérico recibido en el correo para completar el reseteo y solicitud de sesión.
   *
   * @param email Correo electrónico del usuario.
   * @param codigoVerificacion Código numérico de 6 dígitos enviado al correo.
   * @returns Observable indicando si se registró la solicitud y un mensaje informativo.
   */
  confirmSessionRequestWithCode(
    email: string,
    codigoVerificacion: string
  ): Observable<{ solicitado?: boolean; mensaje?: string }> {
    return this.http.post<{ solicitado?: boolean; mensaje?: string }>(
      `${this.baseUrl}/api/sesiones/solicitar/confirmar`,
      {
        email: email.trim(),
        codigoVerificacion: codigoVerificacion.trim(),
      },
      { withCredentials: true }
    );
  }

  /**
   * GET /api/vacaciones (usuario autenticado)
   * Obtiene únicamente las vacaciones solicitadas por el usuario de la sesión activa.
   *
   * @returns Observable con la lista de vacaciones del usuario autenticado.
   */
  getUserVacations(): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/vacaciones`, { withCredentials: true });
  }

  /**
   * GET /api/festivos (usuario autenticado)
   * Obtiene los días festivos de la oficina vinculada al usuario de la sesión activa.
   *
   * @returns Observable con los días festivos y metadatos de la oficina del usuario.
   */
  getUserHolidays(): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/api/festivos`, { withCredentials: true });
  }

  /**
   * POST /api/vacaciones (usuario autenticado)
   * Registra nuevas fechas de vacaciones para el usuario de la sesión activa.
   *
   * @param fechas Lista de fechas en formato `YYYY-MM-DD` a solicitar.
   * @returns Observable con la respuesta de registro de vacaciones.
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
   *
   * @param vacacionId Identificador del día de vacaciones a modificar.
   * @param fecha Nueva fecha en formato `YYYY-MM-DD`.
   * @returns Observable con el registro de vacación actualizado.
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
   *
   * @param vacacionId Identificador del día de vacaciones a cancelar.
   * @returns Observable con la confirmación de cancelación.
   */
  deleteUserVacation(vacacionId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/api/vacaciones/${vacacionId}`, {
      withCredentials: true,
    });
  }

  /**
   * Resuelve la URL base de la API.
   * En desarrollo local (`localhost` / `127.0.0.1`) contra un backend HTTPS remoto,
   * devuelve cadena vacía (`''`) para enrutar `/api/*` a través del proxy de Angular
   * y permitir que la cookie `ht_session` se almacene y envíe como cookie same-origin.
   *
   * @returns URL base sin barra final o `''` cuando se usa el proxy local.
   */
  private resolveBaseUrl(): string {
    const configured = environment.apiUrl.replace(/\/$/, '');
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      configured.startsWith('https://')
    ) {
      return '';
    }
    return configured;
  }

  /**
   * Construye las cabeceras HTTP de autorización Bearer cuando se proporciona un token.
   *
   * @param token Token Bearer de administrador opcional.
   * @returns Instancia de `HttpHeaders` con la cabecera `Authorization` si existe token.
   */
  private auth(token?: string): HttpHeaders {
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
