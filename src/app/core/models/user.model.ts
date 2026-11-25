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

export interface UserTeamBadge {
  id: number;
  nombre: string;
}

export interface OfficeHoliday {
  id: number;
  calendarioId: number;
  oficinaId: number;
  oficinaNombre: string;
  anio: number;
  fecha: string;
  nombre: string;
}

export interface OfficeCalendar {
  id: number;
  oficinaId: number;
  anio: number;
  festivos: OfficeHoliday[];
}

export interface AdminOffice {
  id: number;
  nombre: string;
  usuarioIds: number[];
  calendarios: OfficeCalendar[];
  festivos: OfficeHoliday[];
}

export interface AdminTeam {
  id: number;
  nombre: string;
  usuarioIds: number[];
}

export interface UserFormPayload {
  codigo: string;
  nombre: string;
  apellidos: string;
  cargo: string;
  email: string;
  tipo_vacaciones: string;
  oficinaId: number | null;
  equipoIds: number[];
}

export interface AdminUser extends UserFormPayload {
  id: number;
  oficinaNombre?: string | null;
  equipos: UserTeamBadge[];
  diasVacacionesAnioActual: number;
  sesionActiva?: boolean;
  solicitudPendiente?: boolean;
  estadoSesion?: 'proceso' | 'solicitado' | 'autorizado' | string;
}

export function createEmptyUserForm(): UserFormPayload {
  return {
    codigo: '',
    nombre: '',
    apellidos: '',
    cargo: '',
    email: '',
    tipo_vacaciones: '',
    oficinaId: null,
    equipoIds: [],
  };
}

export function isUserPending(user: AdminUser): boolean {
  return user.sesionActiva === false || user.estadoSesion === 'proceso';
}

export function hasActiveSession(user: AdminUser): boolean {
  return user.estadoSesion === 'autorizado' && !isUserPending(user) && !isUserRequested(user);
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
