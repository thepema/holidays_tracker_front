import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { AdminUser, getUserDisplayName } from '../../../../core/models/user.model';
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
  templateUrl: './vacation-calendar.component.html',
  styleUrl: './vacation-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VacationCalendarComponent {
  readonly users = input<AdminUser[]>([]);
  readonly vacations = input.required<VacationDay[]>();

  protected readonly weekDays = [
    { full: 'Lun', short: 'L' },
    { full: 'Mar', short: 'M' },
    { full: 'Mié', short: 'X' },
    { full: 'Jue', short: 'J' },
    { full: 'Vie', short: 'V' },
    { full: 'Sáb', short: 'S' },
    { full: 'Dom', short: 'D' },
  ] as const;

  protected readonly currentMonth = signal<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  protected readonly selectedDateKey = signal<string | null>(null);

  private hasInitializedMonth = false;

  constructor() {
    effect(() => {
      const vacs = this.vacations();
      if (vacs.length === 0 || this.hasInitializedMonth) {
        return;
      }
      this.hasInitializedMonth = true;

      const current = this.currentMonth();
      const currentPrefix = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-`;
      const hasInCurrentMonth = vacs.some((v) => v.fecha.startsWith(currentPrefix));

      if (!hasInCurrentMonth) {
        const todayKey = formatDateKey(new Date());
        const sortedDates = [...new Set(vacs.map((v) => v.fecha))].sort();
        const upcoming = sortedDates.find((d) => d >= todayKey) ?? sortedDates[sortedDates.length - 1];
        if (upcoming) {
          const [y, m] = upcoming.split('-').map(Number);
          if (Number.isFinite(y) && Number.isFinite(m)) {
            this.currentMonth.set(new Date(y, m - 1, 1));
          }
        }
      }
    });
  }

  protected readonly monthTitle = computed<string>(() =>
    new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
      this.currentMonth()
    )
  );

  protected readonly calendarCells = computed<CalendarDayCell[]>(() => {
    const monthDate = this.currentMonth();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const offset = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = formatDateKey(new Date());

    const userById = new Map<number, AdminUser>();
    const userByName = new Map<string, AdminUser>();
    for (const user of this.users()) {
      userById.set(user.id, user);
      const fullNameKey = getUserDisplayName(user).toLowerCase();
      if (fullNameKey) {
        userByName.set(fullNameKey, user);
      }
    }

    const usersByDate = new Map<string, Map<number, CalendarVacationUser>>();

    for (const vac of this.vacations()) {
      if (!vac.fecha) {
        continue;
      }

      const vacFullNameKey = `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`.trim().toLowerCase();
      const matchedUser =
        userById.get(vac.usuarioId) ??
        (vacFullNameKey ? userByName.get(vacFullNameKey) : undefined);

      const resolvedUserId = matchedUser?.id ?? vac.usuarioId;
      const nombre = (vac.nombre || matchedUser?.nombre || '').trim();
      const apellidos = (vac.apellidos || matchedUser?.apellidos || '').trim();
      const cargo = (vac.cargo || matchedUser?.cargo || '').trim();
      const email = (vac.email || matchedUser?.email || '').trim();

      const fullName =
        `${nombre} ${apellidos}`.trim() ||
        (matchedUser ? getUserDisplayName(matchedUser) : `Usuario #${resolvedUserId}`);
      const initials = computeInitials(nombre || fullName, apellidos);
      const color = getUserColor(resolvedUserId, fullName);

      let dateMap = usersByDate.get(vac.fecha);
      if (!dateMap) {
        dateMap = new Map<number, CalendarVacationUser>();
        usersByDate.set(vac.fecha, dateMap);
      }

      if (!dateMap.has(resolvedUserId)) {
        dateMap.set(resolvedUserId, {
          usuarioId: resolvedUserId,
          nombre,
          apellidos,
          fullName,
          initials,
          cargo,
          email,
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
      vacationCount: 0,
      userNames: [],
      users: [],
    }));

    const dayCells: CalendarDayCell[] = Array.from({ length: daysInMonth }, (_, idx) => {
      const date = new Date(year, month, idx + 1);
      const dateKey = formatDateKey(date);
      const dayOfWeek = date.getDay();
      const dateUsersMap = usersByDate.get(dateKey);
      const dayUsers = dateUsersMap ? [...dateUsersMap.values()] : [];
      const userNames = dayUsers.map((u) => u.fullName);

      return {
        date,
        dayNumber: idx + 1,
        dateKey,
        isToday: dateKey === todayKey,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
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
    return found && found.vacationCount > 0 ? found : null;
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

  protected changeMonth(offset: number): void {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() + offset, 1));
    this.selectedDateKey.set(null);
  }

  protected goToToday(): void {
    const now = new Date();
    this.currentMonth.set(new Date(now.getFullYear(), now.getMonth(), 1));
    const todayKey = formatDateKey(now);
    const hasTodayVacations = this.vacations().some((v) => v.fecha === todayKey);
    if (hasTodayVacations) {
      this.selectedDateKey.set(todayKey);
    } else {
      this.selectedDateKey.set(null);
    }
  }

  protected selectDay(cell: CalendarDayCell): void {
    if (!cell.dateKey || cell.vacationCount === 0) {
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
}
