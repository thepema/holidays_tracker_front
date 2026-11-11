/** Convenio / tipo de vacaciones admitido para un usuario. */
export enum VacationType {
  Habiles = 'habiles',
  Inhabiles = 'inhabiles',
}

export const VACATION_TYPE_OPTIONS: ReadonlyArray<{ value: VacationType; label: string }> = [
  { value: VacationType.Habiles, label: 'Horas libre configuración' },
  { value: VacationType.Inhabiles, label: 'Días inhábiles' },
];

export function getVacationTypeLabel(value: string): string {
  return VACATION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export interface UserFormPayload {
  nombre: string;
  apellidos: string;
  cargo: string;
  email: string;
  tipo_vacaciones: string;
}

export interface AdminUser extends UserFormPayload {
  id: number;
  sesionActiva?: boolean;
  solicitudPendiente?: boolean;
  estadoSesion?: 'proceso' | 'solicitado' | 'autorizado' | string;
}

export function createEmptyUserForm(): UserFormPayload {
  return {
    nombre: '',
    apellidos: '',
    cargo: '',
    email: '',
    tipo_vacaciones: '',
  };
}

export function normalizeUser(value: unknown): AdminUser | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const id = Number(item['id'] ?? item['usuarioId'] ?? item['usuario_id']);
  if (!Number.isFinite(id) || id < 1) {
    return null;
  }

  const rawSession =
    item['sesionActiva'] ??
    item['sesion_activa'] ??
    item['hasSession'] ??
    item['has_session'] ??
    item['sessionActive'] ??
    item['session_active'];

  const sesionActiva = !(
    rawSession === false ||
    rawSession === 0 ||
    rawSession === 'false' ||
    rawSession === null
  );

  const rawEstadoSesion = String(
    item['estado_sesion'] ?? item['estadoSesion'] ?? item['estado'] ?? ''
  ).toLowerCase().trim();

  const solicitudPendiente =
    rawEstadoSesion === 'solicitado' ||
    Boolean(
      item['solicitudPendiente'] ??
        item['solicitud_pendiente'] ??
        item['sessionRequested'] ??
        item['session_requested']
    );

  return {
    id,
    nombre: String(item['nombre'] ?? '').trim(),
    apellidos: String(item['apellidos'] ?? '').trim(),
    cargo: String(item['cargo'] ?? '').trim(),
    email: String(item['email'] ?? '').trim(),
    tipo_vacaciones: String(item['tipo_vacaciones'] ?? '').trim(),
    sesionActiva,
    solicitudPendiente,
    estadoSesion: rawEstadoSesion || (solicitudPendiente ? 'solicitado' : (!sesionActiva ? 'proceso' : 'autorizado')),
  };
}

export function isUserPending(user: AdminUser): boolean {
  return user.sesionActiva === false || user.estadoSesion === 'proceso';
}

export function hasActiveSession(user: AdminUser): boolean {
  return !isUserPending(user) && !isUserRequested(user);
}

export function hasSessionRequest(user: AdminUser): boolean {
  return isUserRequested(user);
}

export function isUserRequested(user: AdminUser): boolean {
  return user.estadoSesion === 'solicitado' || Boolean(user.solicitudPendiente);
}

export function getUserDisplayName(user: AdminUser): string {
  return `${user.nombre} ${user.apellidos}`.trim();
}

export function getUserInitials(user: AdminUser): string {
  const first = user.nombre.charAt(0).toUpperCase();
  const last = user.apellidos.charAt(0).toUpperCase();
  return `${first}${last}` || 'U';
}
