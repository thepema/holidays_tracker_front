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

export interface AdminTeam {
  id: number;
  nombre: string;
  usuarioIds: number[];
}

export interface UserFormPayload {
  nombre: string;
  apellidos: string;
  cargo: string;
  email: string;
  tipo_vacaciones: string;
  equipoIds: number[];
}

export interface AdminUser extends UserFormPayload {
  id: number;
  equipos: UserTeamBadge[];
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
    equipoIds: [],
  };
}

export function normalizeTeam(value: unknown): AdminTeam | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const id = Number(item['id'] ?? item['equipoId'] ?? item['equipo_id']);
  const nombre = String(item['nombre'] ?? item['name'] ?? '').trim();
  if (!Number.isFinite(id) || id < 1 || !nombre) {
    return null;
  }

  const rawUsers =
    item['usuarioIds'] ??
    item['usuario_ids'] ??
    item['usuarios'] ??
    item['userIds'] ??
    item['user_ids'] ??
    [];
  const usuarioIdsSet = new Set<number>();
  if (Array.isArray(rawUsers)) {
    for (const entry of rawUsers) {
      const uid = Number(
        typeof entry === 'object' && entry !== null
          ? ((entry as Record<string, unknown>)['id'] ??
            (entry as Record<string, unknown>)['usuarioId'] ??
            (entry as Record<string, unknown>)['usuario_id'])
          : entry
      );
      if (Number.isInteger(uid) && uid > 0) {
        usuarioIdsSet.add(uid);
      }
    }
  }

  return {
    id,
    nombre,
    usuarioIds: [...usuarioIdsSet],
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

  const equiposMap = new Map<number, UserTeamBadge>();
  const rawEquipos = item['equipos'] ?? item['teams'] ?? [];
  if (Array.isArray(rawEquipos)) {
    for (const entry of rawEquipos) {
      if (typeof entry === 'object' && entry !== null) {
        const rec = entry as Record<string, unknown>;
        const tid = Number(rec['id'] ?? rec['equipoId'] ?? rec['equipo_id']);
        const tname = String(rec['nombre'] ?? rec['name'] ?? '').trim();
        if (Number.isInteger(tid) && tid > 0) {
          equiposMap.set(tid, { id: tid, nombre: tname || `Equipo #${tid}` });
        }
      } else {
        const tid = Number(entry);
        if (Number.isInteger(tid) && tid > 0 && !equiposMap.has(tid)) {
          equiposMap.set(tid, { id: tid, nombre: `Equipo #${tid}` });
        }
      }
    }
  }

  const rawEquipoIds = item['equipoIds'] ?? item['equipo_ids'] ?? [];
  if (Array.isArray(rawEquipoIds)) {
    for (const rawId of rawEquipoIds) {
      const tid = Number(rawId);
      if (Number.isInteger(tid) && tid > 0 && !equiposMap.has(tid)) {
        equiposMap.set(tid, { id: tid, nombre: `Equipo #${tid}` });
      }
    }
  }

  const equipos = [...equiposMap.values()];
  const equipoIds = equipos.map((e) => e.id);

  return {
    id,
    nombre: String(item['nombre'] ?? '').trim(),
    apellidos: String(item['apellidos'] ?? '').trim(),
    cargo: String(item['cargo'] ?? '').trim(),
    email: String(item['email'] ?? '').trim(),
    tipo_vacaciones: String(item['tipo_vacaciones'] ?? '').trim(),
    equipos,
    equipoIds,
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
