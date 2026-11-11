export interface UserColorPalette {
  bg: string;
  text: string;
  border: string;
  softBg: string;
}

export interface VacationDay {
  id?: number;
  usuarioId: number;
  fecha: string;
  anio?: number;
  nombre?: string;
  apellidos?: string;
  cargo?: string;
  email?: string;
}

export interface CalendarVacationUser {
  usuarioId: number;
  nombre: string;
  apellidos: string;
  fullName: string;
  initials: string;
  cargo: string;
  email: string;
  color: UserColorPalette;
}

export interface CalendarDayCell {
  date: Date | null;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isWeekend: boolean;
  vacationCount: number;
  userNames: string[];
  users: CalendarVacationUser[];
}

export const USER_COLOR_PALETTE: ReadonlyArray<UserColorPalette> = [
  { bg: '#0e3345', text: '#ffffff', border: '#08202c', softBg: '#e2ecf0' },
  { bg: '#0f766e', text: '#ffffff', border: '#115e59', softBg: '#ccfbf1' },
  { bg: '#b45309', text: '#ffffff', border: '#92400e', softBg: '#fef3c7' },
  { bg: '#4338ca', text: '#ffffff', border: '#3730a3', softBg: '#e0e7ff' },
  { bg: '#be123c', text: '#ffffff', border: '#9f1239', softBg: '#ffe4e6' },
  { bg: '#15803d', text: '#ffffff', border: '#166534', softBg: '#dcfce7' },
  { bg: '#7e22ce', text: '#ffffff', border: '#6b21a8', softBg: '#f3e8ff' },
  { bg: '#0369a1', text: '#ffffff', border: '#075985', softBg: '#e0f2fe' },
  { bg: '#c2410c', text: '#ffffff', border: '#9a3412', softBg: '#ffedd5' },
  { bg: '#a21caf', text: '#ffffff', border: '#86198f', softBg: '#fae8ff' },
  { bg: '#1d4ed8', text: '#ffffff', border: '#1e40af', softBg: '#dbeafe' },
  { bg: '#3f6212', text: '#ffffff', border: '#365314', softBg: '#ecfccb' },
];

export function getUserColor(usuarioId: number, fallbackKey = ''): UserColorPalette {
  if (Number.isFinite(usuarioId) && usuarioId > 0) {
    const index = (Math.abs(Math.trunc(usuarioId)) - 1) % USER_COLOR_PALETTE.length;
    return USER_COLOR_PALETTE[index];
  }
  let hash = 0;
  for (let i = 0; i < fallbackKey.length; i++) {
    hash = (hash * 31 + fallbackKey.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % USER_COLOR_PALETTE.length;
  return USER_COLOR_PALETTE[index];
}

export function computeInitials(nombre: string, apellidos: string): string {
  const cleanFirst = (nombre ?? '').trim();
  const cleanLast = (apellidos ?? '').trim();

  if (cleanFirst && cleanLast) {
    return `${cleanFirst.charAt(0)}${cleanLast.charAt(0)}`.toUpperCase();
  }

  const combined = `${cleanFirst} ${cleanLast}`.trim();
  if (!combined) {
    return 'U';
  }

  const parts = combined.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function buildSyntheticUserId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 900000) + 100000;
}

export function normalizeDateKey(rawDate: unknown): string {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return formatDateKey(rawDate);
  }
  if (typeof rawDate !== 'string') {
    return '';
  }
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const midnightMatch = /^(\d{4}-\d{2}-\d{2})[T\s]00:00:00(?:\.\d+)?Z?$/i.exec(trimmed);
  if (midnightMatch) {
    return midnightMatch[1];
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const adjusted = new Date(parsed.getTime() + 3 * 60 * 60 * 1000);
      const y = adjusted.getUTCFullYear();
      const m = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
      const d = String(adjusted.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return trimmed.slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const dmyMatch = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }

  return '';
}

export function normalizeVacationEntry(value: unknown): VacationDay[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const item = value as Record<string, unknown>;
  const nestedUser =
    typeof item['usuario'] === 'object' && item['usuario'] !== null
      ? (item['usuario'] as Record<string, unknown>)
      : typeof item['user'] === 'object' && item['user'] !== null
        ? (item['user'] as Record<string, unknown>)
        : {};

  const nombre = String(
    item['nombre'] ?? item['name'] ?? nestedUser['nombre'] ?? nestedUser['name'] ?? ''
  ).trim();
  const apellidos = String(
    item['apellidos'] ??
      item['apellido'] ??
      item['lastName'] ??
      item['last_name'] ??
      nestedUser['apellidos'] ??
      nestedUser['apellido'] ??
      ''
  ).trim();
  const cargo = String(
    item['cargo'] ??
      item['role'] ??
      item['puesto'] ??
      nestedUser['cargo'] ??
      nestedUser['role'] ??
      ''
  ).trim();
  const email = String(item['email'] ?? nestedUser['email'] ?? '').trim();

  const rawUserId =
    item['usuarioId'] ??
    item['usuario_id'] ??
    item['idUsuario'] ??
    item['id_usuario'] ??
    item['userId'] ??
    item['user_id'] ??
    nestedUser['id'] ??
    nestedUser['usuarioId'] ??
    nestedUser['usuario_id'];

  let usuarioId = Number(rawUserId);
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    const fallbackId = Number(item['id']);
    if (
      Array.isArray(item['fechas'] ?? item['dates'] ?? item['dias'] ?? item['vacaciones']) &&
      Number.isFinite(fallbackId) &&
      fallbackId > 0
    ) {
      usuarioId = fallbackId;
    } else if (nombre || apellidos || email) {
      usuarioId = buildSyntheticUserId(`${nombre}|${apellidos}|${email}`.toLowerCase());
    } else if (Number.isFinite(fallbackId) && fallbackId > 0) {
      usuarioId = fallbackId;
    }
  }

  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    return [];
  }

  const rawId = Number(item['id']);
  const id = Number.isFinite(rawId) && rawId > 0 ? rawId : undefined;
  const rawAnio = Number(item['anio'] ?? item['year'] ?? item['año']);
  const anio = Number.isFinite(rawAnio) && rawAnio > 1900 ? rawAnio : undefined;

  const dateListRaw = item['fechas'] ?? item['dates'] ?? item['dias'] ?? item['vacaciones'];
  if (Array.isArray(dateListRaw)) {
    const results: VacationDay[] = [];
    for (const entry of dateListRaw) {
      const rawDateValue =
        typeof entry === 'object' && entry !== null
          ? ((entry as Record<string, unknown>)['fecha'] ??
            (entry as Record<string, unknown>)['date'] ??
            (entry as Record<string, unknown>)['dia'])
          : entry;
      const fecha = normalizeDateKey(rawDateValue);
      if (fecha) {
        results.push({
          id,
          usuarioId,
          fecha,
          anio: anio ?? Number(fecha.slice(0, 4)),
          ...(nombre ? { nombre } : {}),
          ...(apellidos ? { apellidos } : {}),
          ...(cargo ? { cargo } : {}),
          ...(email ? { email } : {}),
        });
      }
    }
    return results;
  }

  const rawDate = item['fecha'] ?? item['date'] ?? item['dia'] ?? item['day'];
  const fecha = normalizeDateKey(rawDate);
  if (!fecha) {
    return [];
  }

  return [
    {
      id,
      usuarioId,
      fecha,
      anio: anio ?? Number(fecha.slice(0, 4)),
      ...(nombre ? { nombre } : {}),
      ...(apellidos ? { apellidos } : {}),
      ...(cargo ? { cargo } : {}),
      ...(email ? { email } : {}),
    },
  ];
}

export function normalizeVacation(value: unknown): VacationDay | null {
  const list = normalizeVacationEntry(value);
  return list[0] ?? null;
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
