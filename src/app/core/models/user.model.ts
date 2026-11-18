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

export function normalizeHoliday(
  value: unknown,
  fallbackOfficeId = 0,
  fallbackOfficeName = '',
  fallbackYear?: number
): OfficeHoliday | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const rawFecha = String(item['fecha'] ?? item['date'] ?? '').trim();
  const fechaMatch = /^(\d{4}-\d{2}-\d{2})/.exec(rawFecha);
  const fecha = fechaMatch ? fechaMatch[1] : '';
  const nombre = String(item['nombre'] ?? item['name'] ?? '').trim();
  if (!fecha || !nombre) {
    return null;
  }

  const idNum = Number(item['id'] ?? 0);
  const id = Number.isInteger(idNum) && idNum > 0 ? idNum : 0;
  const calNum = Number(item['calendarioId'] ?? item['calendario_id'] ?? 0);
  const calendarioId = Number.isInteger(calNum) && calNum > 0 ? calNum : 0;
  const offNum = Number(item['oficinaId'] ?? item['oficina_id'] ?? fallbackOfficeId);
  const oficinaId = Number.isInteger(offNum) && offNum > 0 ? offNum : fallbackOfficeId;
  const oficinaNombre = String(
    item['oficinaNombre'] ?? item['oficina_nombre'] ?? fallbackOfficeName ?? ''
  ).trim();
  const rawAnio = Number(item['anio'] ?? item['year'] ?? fallbackYear ?? fecha.slice(0, 4));
  const anio = Number.isInteger(rawAnio) && rawAnio > 1900 ? rawAnio : Number(fecha.slice(0, 4));

  return {
    id,
    calendarioId,
    oficinaId,
    oficinaNombre,
    anio,
    fecha,
    nombre,
  };
}

export function normalizeOffice(value: unknown): AdminOffice | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const id = Number(item['id'] ?? item['oficinaId'] ?? item['oficina_id']);
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

  const calendarios: OfficeCalendar[] = [];
  const rawCalendars = item['calendarios'] ?? item['calendars'] ?? [];
  if (Array.isArray(rawCalendars)) {
    for (const rawCal of rawCalendars) {
      if (typeof rawCal !== 'object' || rawCal === null) continue;
      const calRec = rawCal as Record<string, unknown>;
      const calId = Number(calRec['id'] ?? calRec['calendarioId'] ?? calRec['calendario_id']);
      const anio = Number(calRec['anio'] ?? calRec['year']);
      if (!Number.isInteger(calId) || calId < 1 || !Number.isInteger(anio) || anio < 1900) {
        continue;
      }
      const rawCalHolidays = calRec['festivos'] ?? calRec['holidays'] ?? [];
      const festivos = Array.isArray(rawCalHolidays)
        ? rawCalHolidays
            .map((h) => normalizeHoliday(h, id, nombre, anio))
            .filter((h): h is OfficeHoliday => h !== null)
            .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
        : [];
      calendarios.push({
        id: calId,
        oficinaId: id,
        anio,
        festivos,
      });
    }
  }
  calendarios.sort((a, b) => b.anio - a.anio || a.id - b.id);

  const flatHolidayMap = new Map<string, OfficeHoliday>();
  for (const cal of calendarios) {
    for (const h of cal.festivos) {
      flatHolidayMap.set(`${h.fecha}|${h.id}`, h);
    }
  }
  const rawFlatHolidays = item['festivos'] ?? item['holidays'] ?? [];
  if (Array.isArray(rawFlatHolidays)) {
    for (const rawH of rawFlatHolidays) {
      const h = normalizeHoliday(rawH, id, nombre);
      if (h && !flatHolidayMap.has(`${h.fecha}|${h.id}`)) {
        flatHolidayMap.set(`${h.fecha}|${h.id}`, h);
      }
    }
  }
  const festivos = [...flatHolidayMap.values()].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id
  );

  return {
    id,
    nombre,
    usuarioIds: [...usuarioIdsSet],
    calendarios,
    festivos,
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

  const rawOfficeObj =
    typeof item['oficina'] === 'object' && item['oficina'] !== null
      ? (item['oficina'] as Record<string, unknown>)
      : null;
  const rawOfficeId = Number(
    item['oficinaId'] ??
      item['oficina_id'] ??
      rawOfficeObj?.['id'] ??
      rawOfficeObj?.['oficinaId']
  );
  const oficinaId = Number.isInteger(rawOfficeId) && rawOfficeId > 0 ? rawOfficeId : null;
  const rawOfficeName = String(
    item['oficinaNombre'] ?? item['oficina_nombre'] ?? rawOfficeObj?.['nombre'] ?? ''
  ).trim();
  const oficinaNombre = rawOfficeName || null;

  return {
    id,
    codigo: String(item['codigo'] ?? item['code'] ?? '').trim(),
    nombre: String(item['nombre'] ?? '').trim(),
    apellidos: String(item['apellidos'] ?? '').trim(),
    cargo: String(item['cargo'] ?? '').trim(),
    email: String(item['email'] ?? '').trim(),
    tipo_vacaciones: String(item['tipo_vacaciones'] ?? '').trim(),
    oficinaId,
    oficinaNombre,
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
