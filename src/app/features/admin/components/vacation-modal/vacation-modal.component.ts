import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminUser, OfficeHoliday, getUserDisplayName } from '../../../../core/models/user.model';
import { VacationDay } from '../../../../core/models/vacation.model';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-vacation-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './vacation-modal.component.html',
  styleUrl: './vacation-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VacationModalComponent {
  readonly user = input.required<AdminUser>();
  readonly userVacations = input<VacationDay[]>([]);
  readonly userHolidays = input<OfficeHoliday[]>([]);
  readonly loading = input<boolean>(false);
  readonly saving = input<boolean>(false);
  readonly deletingVacationId = input<number | null>(null);

  readonly saveDates = output<string>();
  readonly deleteVacation = output<number>();
  readonly cancel = output<void>();

  protected readonly vacationDates = signal<string>('');
  protected readonly pickerDate = signal<string>('');

  protected readonly userFullName = computed<string>(() => getUserDisplayName(this.user()));

  protected readonly holidayMap = computed<ReadonlyMap<string, OfficeHoliday>>(() => {
    const map = new Map<string, OfficeHoliday>();
    for (const h of this.userHolidays()) {
      if (h.fecha) {
        map.set(h.fecha, h);
      }
    }
    return map;
  });

  protected readonly pickerHolidayWarning = computed<string | null>(() => {
    const selected = this.pickerDate().trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selected)) {
      return null;
    }
    const [y, m, d] = selected.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) {
      return `El ${selected} es fin de semana y no puede seleccionarse como vacaciones.`;
    }
    const holiday = this.holidayMap().get(selected);
    if (holiday) {
      return `El ${selected} es día festivo de la oficina (${holiday.nombre}) y no puede seleccionarse.`;
    }
    return null;
  });

  protected readonly datesValidationErrors = computed<string[]>(() => {
    const raw = this.vacationDates().trim();
    if (!raw) {
      return [];
    }
    const tokens = [
      ...new Set(
        raw
          .split(/[\s,;]+/)
          .map((d) => d.trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      ),
    ];
    const holidays = this.holidayMap();
    const errors: string[] = [];
    for (const date of tokens) {
      const [y, m, d] = date.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      if (dow === 0 || dow === 6) {
        errors.push(`${date}: es fin de semana`);
        continue;
      }
      const h = holidays.get(date);
      if (h) {
        errors.push(`${date}: festivo (${h.nombre})`);
      }
    }
    return errors;
  });

  protected readonly sortedUserVacations = computed<
    Array<{ id?: number; fecha: string; weekday: string; formattedDate: string }>
  >(() => {
    const byDate = new Map<string, VacationDay>();
    for (const item of this.userVacations()) {
      if (!item.fecha) {
        continue;
      }
      const existing = byDate.get(item.fecha);
      if (!existing || (!existing.id && item.id)) {
        byDate.set(item.fecha, item);
      }
    }

    return [...byDate.values()]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((item) => {
        const [y, m, d] = item.fecha.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(dateObj);
        const formattedDate = new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(dateObj);
        return {
          id: item.id,
          fecha: item.fecha,
          weekday,
          formattedDate,
        };
      });
  });

  protected readonly parsedDatesCount = computed<number>(() => {
    const raw = this.vacationDates().trim();
    if (!raw) {
      return 0;
    }
    return new Set(
      raw
        .split(/[\s,;]+/)
        .map((d) => d.trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    ).size;
  });

  protected appendPickerDate(): void {
    const selected = this.pickerDate().trim();
    if (!selected || this.pickerHolidayWarning()) {
      return;
    }
    const current = this.vacationDates().trim();
    const updated = current ? `${current}, ${selected}` : selected;
    this.vacationDates.set(updated);
    this.pickerDate.set('');
  }

  protected submitVacations(): void {
    if (this.saving() || this.datesValidationErrors().length > 0) {
      return;
    }
    this.saveDates.emit(this.vacationDates());
  }

  protected onDeleteVacation(item: {
    id?: number;
    fecha: string;
    formattedDate: string;
  }): void {
    if (!item.id || this.deletingVacationId() === item.id) {
      return;
    }
    if (
      confirm(
        `¿Eliminar el día de vacaciones ${item.formattedDate} (${item.fecha}) de ${this.userFullName()}?`
      )
    ) {
      this.deleteVacation.emit(item.id);
    }
  }
}
