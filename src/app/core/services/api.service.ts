import { Injectable, inject, signal } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { Observable, catchError, defer, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminOffice,
  AdminTeam,
  AdminUser,
  OfficeHoliday,
  UserFormPayload,
} from '../models/user.model';
import { VacationDay } from '../models/vacation.model';

export type { AdminUser, UserFormPayload };

const ADMIN_TOKEN_STORAGE_KEY = 'holidays_tracker_admin_token';

/**
 * Resumen de sesiones devuelto por `GET /api/sesiones/resumen`.
 */
export interface AdminSessionsSummaryResponse {
  pendientes: AdminUser[];
  solicitados: AdminUser[];
  totalPendientes: number;
  totalSolicitados: number;
  totalPendientesYSolicitados: number;
  totalAutenticados: number;
}

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

/**
 * Respuesta devuelta por `GET /api/sesiones/api-token` para configurar agentes de IA (MCP).
 */
export interface UserApiTokenResponse {
  apiToken: string;
  headerName: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = this.resolveBaseUrl();
  private readonly adminTokenSignal = signal<string>(this.readInitialAdminToken());

  /** Señal de solo lectura con el token Bearer de administrador activo. */
  readonly adminToken = this.adminTokenSignal.asReadonly();

  /**
   * Comprueba si existe un token de administrador válido (no vacío y no expirado).
   * Si existía un token caducado en memoria/storage, lo limpia automáticamente.
   */
  hasValidAdminToken(): boolean {
    const current = this.adminTokenSignal().trim();
    if (!current) {
      return false;
    }
    if (this.isAdminTokenExpired(current)) {
      this.clearAdminToken();
      return false;
    }
    return true;
  }

  /**
   * Registra y persiste en `sessionStorage` el token Bearer de administrador.
   */
  setAdminToken(token: string): boolean {
    const cleanToken = token.trim();
    if (!cleanToken || this.isAdminTokenExpired(cleanToken)) {
      this.clearAdminToken();
      return false;
    }
    this.saveTokenToSessionStorage(cleanToken);
    this.adminTokenSignal.set(cleanToken);
    return true;
  }

  /**
   * Elimina el token Bearer de administrador tanto de memoria como de `sessionStorage`.
   */
  clearAdminToken(): void {
    this.removeTokenFromSessionStorage();
    if (this.adminTokenSignal() !== '') {
      this.adminTokenSignal.set('');
    }
  }

  /**
   * POST /api/admin/login
   * Inicia sesión como administrador validando la contraseña proporcionada.
   *
   * @param password Contraseña de administrador.
   * @returns Observable con la respuesta de autenticación (incluyendo el token Bearer).
   */
  login(password: string): Observable<{ token: string; tokenType: string; expiresIn: number }> {
    return this.http.post<{ token: string; tokenType: string; expiresIn: number }>(
      `${this.baseUrl}/api/admin/login`,
      { password }
    );
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
   * @returns Observable con el listado de usuarios registrados.
   */
  getUsers(): Observable<{ usuarios: AdminUser[] }> {
    return this.withAdminAuth((headers) =>
      this.http.get<{ usuarios: AdminUser[] }>(`${this.baseUrl}/api/usuarios`, { headers })
    );
  }

  /**
   * GET /api/usuarios/pendientes (administrador)
   * Obtiene todos los datos de los usuarios a los que se les ha enviado la invitación
   * (estado = 'proceso') y aún no han completado la autenticación.
   *
   * @returns Observable con la lista de usuarios pendientes de activación.
   */
  getPendingUsers(): Observable<{ usuarios: AdminUser[] }> {
    return this.withAdminAuth((headers) =>
      this.http.get<{ usuarios: AdminUser[] }>(`${this.baseUrl}/api/usuarios/pendientes`, {
        headers,
      })
    );
  }

  /**
   * GET /api/sesiones/resumen (administrador)
   * Obtiene el resumen de sesiones de usuarios desde servidor: listados de pendientes (`proceso`),
   * solicitados (`solicitado`) y contadores totales (incluyendo usuarios autenticados).
   */
  getSessionsSummary(): Observable<AdminSessionsSummaryResponse> {
    return this.withAdminAuth((headers) =>
      this.http.get<AdminSessionsSummaryResponse>(`${this.baseUrl}/api/sesiones/resumen`, {
        headers,
      })
    );
  }

  /**
   * POST /api/usuarios (administrador)
   * Crea un nuevo usuario en el sistema.
   *
   * @param user Datos del usuario a crear.
   * @returns Observable con la respuesta de creación del usuario.
   */
  createUser(user: UserFormPayload): Observable<{ usuario: AdminUser }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ usuario: AdminUser }>(`${this.baseUrl}/api/usuarios`, user, { headers })
    );
  }

  /**
   * PATCH /api/usuarios/:userId (administrador)
   * Actualiza parcialmente los datos de un usuario existente.
   *
   * @param userId Identificador del usuario a modificar.
   * @param user Campos parciales del usuario a actualizar.
   * @returns Observable con el usuario actualizado.
   */
  updateUser(userId: number, user: Partial<AdminUser>): Observable<{ usuario: AdminUser }> {
    return this.withAdminAuth((headers) =>
      this.http.patch<{ usuario: AdminUser }>(`${this.baseUrl}/api/usuarios/${userId}`, user, {
        headers,
      })
    );
  }

  /**
   * GET /api/equipos (administrador)
   * Obtiene el listado completo de equipos registrados.
   *
   * @returns Observable con la lista de equipos.
   */
  getTeams(): Observable<{ equipos: AdminTeam[] }> {
    return this.withAdminAuth((headers) =>
      this.http.get<{ equipos: AdminTeam[] }>(`${this.baseUrl}/api/equipos`, { headers })
    );
  }

  /**
   * POST /api/equipos (administrador)
   * Crea un nuevo equipo y opcionalmente le asigna usuarios iniciales.
   *
   * @param payload Nombre del equipo y lista opcional de IDs de usuarios.
   * @returns Observable con el equipo creado.
   */
  createTeam(payload: { nombre: string; usuarioIds?: number[] }): Observable<{ equipo: AdminTeam }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ equipo: AdminTeam }>(`${this.baseUrl}/api/equipos`, payload, { headers })
    );
  }

  /**
   * PATCH /api/equipos/:equipoId (administrador)
   * Modifica el nombre o los miembros asignados a un equipo.
   *
   * @param equipoId Identificador del equipo a actualizar.
   * @param payload Campos a modificar (nombre y/o lista de IDs de usuarios).
   * @returns Observable con el equipo actualizado.
   */
  updateTeam(
    equipoId: number,
    payload: { nombre?: string; usuarioIds?: number[] }
  ): Observable<{ equipo: AdminTeam }> {
    return this.withAdminAuth((headers) =>
      this.http.patch<{ equipo: AdminTeam }>(`${this.baseUrl}/api/equipos/${equipoId}`, payload, {
        headers,
      })
    );
  }

  /**
   * DELETE /api/equipos/:equipoId (administrador)
   * Elimina un equipo existente del sistema.
   *
   * @param equipoId Identificador del equipo a eliminar.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteTeam(equipoId: number): Observable<{ eliminado: boolean; id: number }> {
    return this.withAdminAuth((headers) =>
      this.http.delete<{ eliminado: boolean; id: number }>(
        `${this.baseUrl}/api/equipos/${equipoId}`,
        { headers }
      )
    );
  }

  /**
   * GET /api/oficinas (administrador)
   * Obtiene todas las oficinas junto con sus usuarios, calendarios y festivos.
   *
   * @returns Observable con la lista de oficinas.
   */
  getOffices(): Observable<{ oficinas: AdminOffice[] }> {
    return this.withAdminAuth((headers) =>
      this.http.get<{ oficinas: AdminOffice[] }>(`${this.baseUrl}/api/oficinas`, { headers })
    );
  }

  /**
   * POST /api/oficinas (administrador)
   * Crea una nueva oficina y opcionalmente vincula usuarios iniciales.
   *
   * @param payload Nombre de la oficina y lista opcional de IDs de usuarios.
   * @returns Observable con la oficina creada.
   */
  createOffice(payload: {
    nombre: string;
    usuarioIds?: number[] | undefined;
  }): Observable<{ oficina: AdminOffice }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ oficina: AdminOffice }>(`${this.baseUrl}/api/oficinas`, payload, { headers })
    );
  }

  /**
   * PATCH /api/oficinas/:oficinaId (administrador)
   * Actualiza el nombre o los usuarios asignados a una oficina.
   *
   * @param oficinaId Identificador de la oficina a modificar.
   * @param payload Campos a actualizar (nombre y/o lista de IDs de usuarios).
   * @returns Observable con la oficina actualizada.
   */
  updateOffice(
    oficinaId: number,
    payload: { nombre?: string; usuarioIds?: number[] }
  ): Observable<{ oficina: AdminOffice }> {
    return this.withAdminAuth((headers) =>
      this.http.patch<{ oficina: AdminOffice }>(
        `${this.baseUrl}/api/oficinas/${oficinaId}`,
        payload,
        { headers }
      )
    );
  }

  /**
   * DELETE /api/oficinas/:oficinaId (administrador)
   * Elimina una oficina existente junto con sus calendarios y festivos asociados.
   *
   * @param oficinaId Identificador de la oficina a eliminar.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteOffice(oficinaId: number): Observable<{ eliminado: boolean; id: number }> {
    return this.withAdminAuth((headers) =>
      this.http.delete<{ eliminado: boolean; id: number }>(
        `${this.baseUrl}/api/oficinas/${oficinaId}`,
        { headers }
      )
    );
  }

  /**
   * POST /api/oficinas/:oficinaId/calendarios (administrador)
   * Habilita un calendario laboral anual para una oficina concreta.
   *
   * @param oficinaId Identificador de la oficina.
   * @param anio Año del calendario a crear.
   * @returns Observable con el calendario creado.
   */
  createOfficeCalendar(oficinaId: number, anio: number): Observable<{ oficina: AdminOffice }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ oficina: AdminOffice }>(
        `${this.baseUrl}/api/oficinas/${oficinaId}/calendarios`,
        { anio },
        { headers }
      )
    );
  }

  /**
   * DELETE /api/oficinas/:oficinaId/calendarios/:calendarioId (administrador)
   * Elimina un calendario anual de una oficina junto con sus días festivos.
   *
   * @param oficinaId Identificador de la oficina.
   * @param calendarioId Identificador del calendario anual a eliminar.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteOfficeCalendar(
    oficinaId: number,
    calendarioId: number
  ): Observable<{ eliminado: boolean; oficina: AdminOffice }> {
    return this.withAdminAuth((headers) =>
      this.http.delete<{ eliminado: boolean; oficina: AdminOffice }>(
        `${this.baseUrl}/api/oficinas/${oficinaId}/calendarios/${calendarioId}`,
        { headers }
      )
    );
  }

  /**
   * POST /api/oficinas/:oficinaId/festivos (administrador)
   * Añade un día festivo al calendario de una oficina.
   *
   * @param oficinaId Identificador de la oficina.
   * @param payload Datos del festivo (fecha en formato `YYYY-MM-DD`, nombre y año opcional).
   * @returns Observable con el festivo registrado.
   */
  addOfficeHoliday(
    oficinaId: number,
    payload: { fecha: string; nombre: string; anio?: number }
  ): Observable<{ oficina: AdminOffice }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ oficina: AdminOffice }>(
        `${this.baseUrl}/api/oficinas/${oficinaId}/festivos`,
        payload,
        { headers }
      )
    );
  }

  /**
   * DELETE /api/oficinas/:oficinaId/festivos/:festivoId (administrador)
   * Elimina un día festivo registrado en una oficina.
   *
   * @param oficinaId Identificador de la oficina.
   * @param festivoId Identificador del festivo a eliminar.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteOfficeHoliday(
    oficinaId: number,
    festivoId: number
  ): Observable<{ eliminado: boolean; id: number; oficina: AdminOffice }> {
    return this.withAdminAuth((headers) =>
      this.http.delete<{ eliminado: boolean; id: number; oficina: AdminOffice }>(
        `${this.baseUrl}/api/oficinas/${oficinaId}/festivos/${festivoId}`,
        { headers }
      )
    );
  }

  /**
   * GET /api/vacaciones (administrador)
   * Obtiene las vacaciones registradas filtradas desde servidor por mes, año, equipo, oficina o usuarios.
   */
  getVacations(params?: {
    mes?: number;
    anio?: number;
    equipoId?: number | null;
    oficinaId?: number | null;
    usuarios?: number[];
  }): Observable<{ vacaciones: VacationDay[] }> {
    let queryParams = new HttpParams();
    if (params?.anio) {
      queryParams = queryParams.set('anio', String(params.anio));
    }
    if (params?.mes) {
      queryParams = queryParams.set('mes', String(params.mes));
    }
    if (params?.equipoId) {
      queryParams = queryParams.set('equipoId', String(params.equipoId));
    }
    if (params?.oficinaId) {
      queryParams = queryParams.set('oficinaId', String(params.oficinaId));
    }
    if (params?.usuarios?.length) {
      for (const userId of params.usuarios) {
        if (Number.isInteger(userId) && userId > 0) {
          queryParams = queryParams.append('usuarios', String(userId));
        }
      }
    }
    return this.withAdminAuth((headers) =>
      this.http.get<{ vacaciones: VacationDay[] }>(`${this.baseUrl}/api/vacaciones`, {
        headers,
        params: queryParams,
      })
    );
  }

  /**
   * GET /api/vacaciones/anios (administrador)
   * Obtiene la lista de años distintos que tienen días de vacaciones registrados en BD.
   */
  getVacationYears(): Observable<{ anios: number[] }> {
    return this.withAdminAuth((headers) =>
      this.http.get<{ anios: number[] }>(`${this.baseUrl}/api/vacaciones/anios`, { headers })
    );
  }

  /**
   * GET /api/festivos (administrador)
   * Obtiene los días festivos filtrados desde servidor por año, mes, oficina o equipo.
   */
  getAdminHolidays(params?: {
    anio?: number;
    mes?: number;
    oficinaId?: number | null;
    equipoId?: number | null;
  }): Observable<{ festivos: OfficeHoliday[] }> {
    let queryParams = new HttpParams();
    if (params?.anio) {
      queryParams = queryParams.set('anio', String(params.anio));
    }
    if (params?.mes) {
      queryParams = queryParams.set('mes', String(params.mes));
    }
    if (params?.oficinaId) {
      queryParams = queryParams.set('oficinaId', String(params.oficinaId));
    }
    if (params?.equipoId) {
      queryParams = queryParams.set('equipoId', String(params.equipoId));
    }
    return this.withAdminAuth((headers) =>
      this.http.get<{ festivos: OfficeHoliday[] }>(`${this.baseUrl}/api/festivos`, {
        headers,
        params: queryParams,
      })
    );
  }

  /**
   * POST /api/vacaciones (administrador)
   * Registra una o varias fechas de vacaciones para un usuario concreto.
   *
   * @param usuarioId Identificador del usuario.
   * @param fechas Lista de fechas en formato `YYYY-MM-DD`.
   * @returns Observable con el resultado del registro de vacaciones.
   */
  addVacations(
    usuarioId: number,
    fechas: string[]
  ): Observable<{ guardadas: number; vacaciones: VacationDay[] }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ guardadas: number; vacaciones: VacationDay[] }>(
        `${this.baseUrl}/api/vacaciones`,
        { usuarioId, fechas },
        { headers }
      )
    );
  }

  /**
   * DELETE /api/vacaciones/:vacacionId (administrador)
   * Elimina un día de vacaciones registrado desde el panel de administración.
   *
   * @param vacacionId Identificador del registro de vacación a eliminar.
   * @returns Observable con la confirmación de eliminación.
   */
  deleteVacationAdmin(vacacionId: number): Observable<{ eliminado: boolean; id: number }> {
    return this.withAdminAuth((headers) =>
      this.http.delete<{ eliminado: boolean; id: number }>(
        `${this.baseUrl}/api/vacaciones/${vacacionId}`,
        { headers }
      )
    );
  }

  /**
   * POST /api/vacaciones/recordatorio (administrador)
   * Envía un correo de recordatorio a todos los usuarios autenticados para que registren
   * sus vacaciones previstas en los próximos meses.
   *
   * @returns Observable con el resumen del envío (`total`, `enviadas`, `fallidas`).
   */
  sendVacationReminders(): Observable<{ total: number; enviadas: number; fallidas: number }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ total: number; enviadas: number; fallidas: number }>(
        `${this.baseUrl}/api/vacaciones/recordatorio`,
        {},
        { headers }
      )
    );
  }

  /**
   * POST /api/sesiones/invitaciones (administrador)
   * Envía de forma masiva enlaces de invitación a los usuarios pendientes de activación.
   *
   * @returns Observable con el resultado del envío masivo de invitaciones.
   */
  sendBulkInvitations(): Observable<{
    total: number;
    enviadas: number;
    fallidas: number;
    omitidas: number;
  }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{
        total: number;
        enviadas: number;
        fallidas: number;
        omitidas: number;
      }>(`${this.baseUrl}/api/sesiones/invitaciones`, {}, { headers })
    );
  }

  /**
   * POST /api/usuarios/:usuarioId/invitacion (administrador)
   * Envía o reenvía una invitación individual de acceso a un usuario.
   *
   * @param usuarioId Identificador del usuario destinatario.
   * @returns Observable con la confirmación del envío.
   */
  inviteUser(usuarioId: number): Observable<{ enviada: boolean }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ enviada: boolean }>(
        `${this.baseUrl}/api/usuarios/${usuarioId}/invitacion`,
        {},
        { headers }
      )
    );
  }

  /**
   * POST /api/sesiones/cerrar (administrador)
   * Revoca la sesión activa y el código de recuperación de un usuario.
   *
   * @param usuarioId Identificador del usuario cuya sesión se cerrará.
   * @returns Observable con la confirmación del cierre de sesión.
   */
  closeSession(usuarioId: number): Observable<{ cerrado: boolean; usuarioId: number }> {
    return this.withAdminAuth((headers) =>
      this.http.post<{ cerrado: boolean; usuarioId: number }>(
        `${this.baseUrl}/api/sesiones/cerrar`,
        { usuarioId },
        { headers }
      )
    );
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
   * GET /api/sesiones/api-token
   * Obtiene el API token personal (`token_hash` de la sesión activa) para autenticar agentes de IA en `/mcp`.
   */
  getUserApiToken(): Observable<UserApiTokenResponse> {
    return this.http.get<UserApiTokenResponse>(`${this.baseUrl}/api/sesiones/api-token`, {
      withCredentials: true,
    });
  }

  /**
   * Devuelve la URL pública del endpoint MCP para registrar el servicio en un agente de IA.
   */
  getMcpEndpointUrl(): string {
    const configured = environment.apiUrl.replace(/\/$/, '');
    if (configured) {
      return `${configured}/mcp`;
    }
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/mcp`;
    }
    return '/mcp';
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
  getUserVacations(): Observable<{ vacaciones: VacationDay[] }> {
    return this.http.get<{ vacaciones: VacationDay[] }>(`${this.baseUrl}/api/vacaciones`, {
      withCredentials: true,
    });
  }

  /**
   * GET /api/festivos (usuario autenticado)
   * Obtiene los días festivos de la oficina vinculada al usuario de la sesión activa.
   *
   * @returns Observable con los días festivos y metadatos de la oficina del usuario.
   */
  getUserHolidays(): Observable<{
    oficinaId: number | null;
    oficinaNombre: string | null;
    festivos: OfficeHoliday[];
  }> {
    return this.http.get<{
      oficinaId: number | null;
      oficinaNombre: string | null;
      festivos: OfficeHoliday[];
    }>(`${this.baseUrl}/api/festivos`, { withCredentials: true });
  }

  /**
   * POST /api/vacaciones (usuario autenticado)
   * Registra nuevas fechas de vacaciones para el usuario de la sesión activa.
   *
   * @param fechas Lista de fechas en formato `YYYY-MM-DD` a solicitar.
   * @returns Observable con la respuesta de registro de vacaciones.
   */
  saveUserVacations(
    fechas: string[]
  ): Observable<{ guardadas: number; vacaciones: VacationDay[] }> {
    return this.http.post<{ guardadas: number; vacaciones: VacationDay[] }>(
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
  updateUserVacationDate(
    vacacionId: number,
    fecha: string
  ): Observable<{ vacacion: VacationDay }> {
    return this.http.patch<{ vacacion: VacationDay }>(
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
  deleteUserVacation(vacacionId: number): Observable<{ eliminado: boolean; id: number }> {
    return this.http.delete<{ eliminado: boolean; id: number }>(
      `${this.baseUrl}/api/vacaciones/${vacacionId}`,
      {
        withCredentials: true,
      }
    );
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
   * Centraliza la validación del token Bearer de administrador y la inyección de cabeceras
   * antes de ejecutar cualquier petición administrativa:
   * - Verifica que exista un token activo en la sesión.
   * - Comprueba que no haya caducado según su claim `exp`.
   * - Si el servidor responde `401 Unauthorized`, invalida automáticamente el token almacenado.
   */
  private withAdminAuth<T>(
    requestFactory: (headers: HttpHeaders) => Observable<T>
  ): Observable<T> {
    return defer(() => {
      const token = this.adminTokenSignal().trim();
      if (!token) {
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 401,
              statusText: 'Unauthorized',
              error: { error: 'No hay una sesión de administrador activa.' },
            })
        );
      }

      if (this.isAdminTokenExpired(token)) {
        this.clearAdminToken();
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 401,
              statusText: 'Unauthorized',
              error: { error: 'La sesión de administrador ha expirado. Vuelve a iniciar sesión.' },
            })
        );
      }

      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      return requestFactory(headers).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.clearAdminToken();
          }
          return throwError(() => error);
        })
      );
    });
  }

  private isAdminTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0]) {
      return false;
    }

    try {
      const base64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      if (typeof atob !== 'function') {
        return false;
      }
      const claims = JSON.parse(atob(padded)) as { exp?: unknown };
      if (typeof claims?.exp === 'number' && Number.isFinite(claims.exp)) {
        return claims.exp <= Math.floor(Date.now() / 1000);
      }
    } catch {
      return false;
    }

    return false;
  }

  private readInitialAdminToken(): string {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = (sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '').trim();
        if (!stored) {
          return '';
        }
        if (this.isAdminTokenExpired(stored)) {
          sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
          return '';
        }
        return stored;
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
