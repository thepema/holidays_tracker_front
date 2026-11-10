import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AdminUser, getUserDisplayName } from '../../../../core/models/user.model';
import {
  CalendarDayCell,
  VacationDay,
  formatDateKey,
} from '../../../../core/models/vacation.model';

@Component({
  selector: 'app-vacation-calendar',
  standalone: true,
  templateUrl: './vacation-calendar.component.html',
  styleUrl: './vacation-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VacationCalendarComponent {
  readonly users = input.required<AdminUser[]>();
  readonly vacations = input.required<VacationDay[]>();
  readonly selectedUserIds = input.required<number[]>();

  protected readonly weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
  protected readonly currentMonth = signal<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

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

    const selectedSet = new Set(this.selectedUserIds());
    const userMap = new Map<number, string>();
    for (const user of this.users()) {
      userMap.set(user.id, getUserDisplayName(user));
    }

    const usersByDate = new Map<string, Set<number>>();
    for (const vac of this.vacations()) {
      if (!selectedSet.has(vac.usuarioId)) {
        continue;
      }
      let set = usersByDate.get(vac.fecha);
      if (!set) {
        set = new Set<number>();
        usersByDate.set(vac.fecha, set);
      }
      set.add(vac.usuarioId);
    }

    const emptyCells: CalendarDayCell[] = Array.from({ length: offset }, () => ({
      date: null,
      dayNumber: null,
      dateKey: null,
      isToday: false,
      isWeekend: false,
      vacationCount: 0,
      userNames: [],
    }));

    const dayCells: CalendarDayCell[] = Array.from({ length: daysInMonth }, (_, idx) => {
      const date = new Date(year, month, idx + 1);
      const dateKey = formatDateKey(date);
      const dayOfWeek = date.getDay();
      const userIdSet = usersByDate.get(dateKey);
      const userIds = userIdSet ? [...userIdSet] : [];
      const userNames = userIds.map((id) => userMap.get(id) ?? `Usuario #${id}`);

      return {
        date,
        dayNumber: idx + 1,
        dateKey,
        isToday: dateKey === todayKey,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        vacationCount: userIds.length,
        userNames,
      };
    });

    return [...emptyCells, ...dayCells];
  });

  protected changeMonth(offset: number): void {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  protected goToToday(): void {
    const now = new Date();
    this.currentMonth.set(new Date(now.getFullYear(), now.getMonth(), 1));
  }
}
