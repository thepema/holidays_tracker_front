export interface VacationDay {
  usuarioId: number;
  fecha: string;
}

export interface CalendarDayCell {
  date: Date | null;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isWeekend: boolean;
  vacationCount: number;
  userNames: string[];
}

export function normalizeVacation(value: unknown): VacationDay | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const usuarioId = Number(item['usuarioId'] ?? item['usuario_id'] ?? item['idUsuario']);
  const rawDate = item['fecha'] ?? item['date'];
  const fecha = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';

  return Number.isFinite(usuarioId) && fecha ? { usuarioId, fecha } : null;
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
