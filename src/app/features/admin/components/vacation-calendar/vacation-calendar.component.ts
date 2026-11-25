import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminOffice,
  AdminTeam,
  OfficeHoliday,
} from '../../../../core/models/user.model';
import {
  CalendarDayCell,
  CalendarVacationUser,
  VacationDay,
  computeInitials,
  formatDateKey,
  getUserColor,
} from '../../../../core/models/vacation.model';

@Component({
  selector: 'app-vacation-calendar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './vacation-calendar.component.html',
  styleUrl: './vacation-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VacationCalendarComponent {
  readonly vacations = input.required<VacationDay[]>();
  readonly teams = input<AdminTeam[]>([]);
  readonly offices = input<AdminOffice[]>([]);
  readonly holidays = input<OfficeHoliday[]>([]);
  readonly currentYear = input<number>(new Date().getFullYear());
  readonly currentMonth = input<number>(new Date().getMonth() + 1);
  readonly loading = input<boolean>(false);
  readonly selectedTeamId = input<number | null>(null);
  readonly selectedOfficeId = input<number | null>(null);
  readonly deletingVacationId = input<number | null>(null);

  readonly monthChange = output<{ year: number; month: number }>();
  readonly teamFilterChange = output<number | null>();
  readonly officeFilterChange = output<number | null>();
  readonly deleteVacation = output<{ vacacionId: number; fullName: string; fecha: string }>();

  protected readonly weekDays = [
    { full: 'Lun', short: 'L' },
    { full: 'Mar', short: 'M' },
    { full: 'Mié', short: 'X' },
    { full: 'Jue', short: 'J' },
    { full: 'Vie', short: 'V' },
    { full: 'Sáb', short: 'S' },
    { full: 'Dom', short: 'D' },
  ] as const;

  protected readonly selectedDateKey = signal<string | null>(null);

  protected readonly selectedTeamName = computed<string | null>(() => {
    const id = this.selectedTeamId();
    if (id === null) {
      return null;
    }
    return this.teams().find((t) => t.id === id)?.nombre ?? null;
  });

  protected readonly selectedOfficeName = computed<string | null>(() => {
    const id = this.selectedOfficeId();
    if (id === null) {
      return null;
    }
    return this.offices().find((o) => o.id === id)?.nombre ?? null;
  });

  protected readonly monthTitle = computed<string>(() =>
    new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
      new Date(this.currentYear(), this.currentMonth() - 1, 1)
    )
  );

  protected readonly calendarCells = computed<CalendarDayCell[]>(() => {
    const year = this.currentYear();
    const monthIndex = this.currentMonth() - 1;

    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const offset = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const todayKey = formatDateKey(new Date());

    const holidaysByDate = new Map<string, OfficeHoliday[]>();
    for (const h of this.holidays()) {
      if (!h.fecha) continue;
      let list = holidaysByDate.get(h.fecha);
      if (!list) {
        list = [];
        holidaysByDate.set(h.fecha, list);
      }
      if (
        !list.some(
          (item) =>
            item.id === h.id &&
            item.oficinaId === h.oficinaId &&
            item.nombre === h.nombre
        )
      ) {
        list.push(h);
      }
    }

    const usersByDate = new Map<string, Map<number, CalendarVacationUser>>();

    for (const vac of this.vacations()) {
      if (!vac.fecha) {
        continue;
      }

      const codigo = (vac.codigo || '').trim();
      const nombre = (vac.nombre || '').trim();
      const apellidos = (vac.apellidos || '').trim();
      const cargo = (vac.cargo || '').trim();
      const email = (vac.email || '').trim();
      const fullName = `${nombre} ${apellidos}`.trim() || `Usuario #${vac.usuarioId}`;
      const initials = computeInitials(nombre || fullName, apellidos);
      const color = getUserColor(vac.usuarioId, fullName);

      let dateMap = usersByDate.get(vac.fecha);
      if (!dateMap) {
        dateMap = new Map<number, CalendarVacationUser>();
        usersByDate.set(vac.fecha, dateMap);
      }

      if (!dateMap.has(vac.usuarioId)) {
        dateMap.set(vac.usuarioId, {
          usuarioId: vac.usuarioId,
          ...(vac.id ? { vacacionId: vac.id } : {}),
          ...(codigo ? { codigo } : {}),
          nombre,
          apellidos,
          fullName,
          initials,
          cargo,
          email,
          equipos: vac.equipos ?? [],
          color,
        });
      }
    }

    const emptyCells: CalendarDayCell[] = Array.from({ length: offset }, () => ({
      date: null,
      dayNumber: null,
      dateKey: null,
      isToday: false,
      isWeekend: false,
      isHoliday: false,
      holidays: [],
      vacationCount: 0,
      userNames: [],
      users: [],
    }));

    const dayCells: CalendarDayCell[] = Array.from({ length: daysInMonth }, (_, idx) => {
      const date = new Date(year, monthIndex, idx + 1);
      const dateKey = formatDateKey(date);
      const dayOfWeek = date.getDay();
      const dateUsersMap = usersByDate.get(dateKey);
      const dayUsers = dateUsersMap ? [...dateUsersMap.values()] : [];
      const userNames = dayUsers.map((u) => u.fullName);
      const dayHolidays = holidaysByDate.get(dateKey) ?? [];

      return {
        date,
        dayNumber: idx + 1,
        dateKey,
        isToday: dateKey === todayKey,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: dayHolidays.length > 0,
        holidays: dayHolidays,
        vacationCount: dayUsers.length,
        userNames,
        users: dayUsers,
      };
    });

    return [...emptyCells, ...dayCells];
  });

  protected readonly monthVacationUsers = computed<CalendarVacationUser[]>(() => {
    const unique = new Map<number, CalendarVacationUser>();
    for (const cell of this.calendarCells()) {
      for (const user of cell.users) {
        if (!unique.has(user.usuarioId)) {
          unique.set(user.usuarioId, user);
        }
      }
    }
    return [...unique.values()];
  });

  protected readonly monthVacationDaysCount = computed<number>(() =>
    this.calendarCells().filter((cell) => cell.vacationCount > 0).length
  );

  protected readonly selectedCell = computed<CalendarDayCell | null>(() => {
    const key = this.selectedDateKey();
    if (!key) {
      return null;
    }
    const found = this.calendarCells().find((cell) => cell.dateKey === key) ?? null;
    return found && (found.vacationCount > 0 || found.isHoliday) ? found : null;
  });

  protected readonly selectedDateFormatted = computed<string>(() => {
    const cell = this.selectedCell();
    if (!cell?.date) {
      return '';
    }
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(cell.date);
  });

  protected onTeamSelectChange(value: string | number | null): void {
    if (value === null || value === '' || value === 'all') {
      this.teamFilterChange.emit(null);
      return;
    }
    const parsed = Number(value);
    this.teamFilterChange.emit(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }

  protected onOfficeSelectChange(value: string | number | null): void {
    if (value === null || value === '' || value === 'all') {
      this.officeFilterChange.emit(null);
      return;
    }
    const parsed = Number(value);
    this.officeFilterChange.emit(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }

  protected holidayTooltip(holidays: OfficeHoliday[]): string {
    return holidays
      .map((h) => (h.oficinaNombre ? `${h.nombre} (${h.oficinaNombre})` : h.nombre))
      .join(' · ');
  }

  protected changeMonth(offset: number): void {
    const nextDate = new Date(this.currentYear(), this.currentMonth() - 1 + offset, 1);
    this.selectedDateKey.set(null);
    this.monthChange.emit({
      year: nextDate.getFullYear(),
      month: nextDate.getMonth() + 1,
    });
  }

  protected goToToday(): void {
    const now = new Date();
    const targetYear = now.getFullYear();
    const targetMonth = now.getMonth() + 1;
    const isAlreadyCurrentMonth =
      this.currentYear() === targetYear && this.currentMonth() === targetMonth;

    if (!isAlreadyCurrentMonth) {
      this.selectedDateKey.set(null);
      this.monthChange.emit({ year: targetYear, month: targetMonth });
      return;
    }

    const todayKey = formatDateKey(now);
    const hasTodayVacations = this.vacations().some((v) => v.fecha === todayKey);
    const hasTodayHolidays = this.holidays().some((h) => h.fecha === todayKey);
    this.selectedDateKey.set(hasTodayVacations || hasTodayHolidays ? todayKey : null);
  }

  protected selectDay(cell: CalendarDayCell): void {
    if (!cell.dateKey || (cell.vacationCount === 0 && !cell.isHoliday)) {
      return;
    }
    if (this.selectedDateKey() === cell.dateKey) {
      this.selectedDateKey.set(null);
    } else {
      this.selectedDateKey.set(cell.dateKey);
    }
  }

  protected closeDetail(): void {
    this.selectedDateKey.set(null);
  }

  protected onDeleteUserVacation(user: CalendarVacationUser, dateKey: string | null): void {
    if (!user.vacacionId || !dateKey || this.deletingVacationId() === user.vacacionId) {
      return;
    }
    if (confirm(`¿Eliminar el día de vacaciones (${dateKey}) de ${user.fullName}?`)) {
      this.deleteVacation.emit({
        vacacionId: user.vacacionId,
        fullName: user.fullName,
        fecha: dateKey,
      });
    }
  }
}
