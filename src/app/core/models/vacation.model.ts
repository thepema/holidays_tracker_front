import { OfficeHoliday, UserTeamBadge } from './user.model';

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
  codigo?: string;
  nombre?: string;
  apellidos?: string;
  cargo?: string;
  email?: string;
  oficinaId?: number | null;
  oficinaNombre?: string | null;
  equipos?: UserTeamBadge[];
}

export interface CalendarVacationUser {
  usuarioId: number;
  vacacionId?: number;
  codigo?: string;
  nombre: string;
  apellidos: string;
  fullName: string;
  initials: string;
  cargo: string;
  email: string;
  equipos: UserTeamBadge[];
  color: UserColorPalette;
}

export interface CalendarDayCell {
  date: Date | null;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidays: OfficeHoliday[];
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

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
