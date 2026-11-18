import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminOffice,
  AdminUser,
  OfficeCalendar,
  OfficeHoliday,
  getUserDisplayName,
  getUserInitials,
} from '../../../../core/models/user.model';
import { UserColorPalette, getUserColor } from '../../../../core/models/vacation.model';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

type OfficeEditorTab = 'details' | 'holidays';

@Component({
  selector: 'app-offices-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './offices-modal.component.html',
  styleUrl: './offices-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfficesModalComponent implements OnInit {
  readonly offices = input.required<AdminOffice[]>();
  readonly users = input.required<AdminUser[]>();
  readonly saving = input<boolean>(false);

  readonly createOffice = output<{ nombre: string; usuarioIds: number[] }>();
  readonly updateOffice = output<{ oficinaId: number; nombre: string; usuarioIds: number[] }>();
  readonly deleteOffice = output<AdminOffice>();
  readonly createCalendar = output<{ oficinaId: number; anio: number }>();
  readonly deleteCalendar = output<{ oficinaId: number; calendarioId: number }>();
  readonly addHoliday = output<{ oficinaId: number; fecha: string; nombre: string }>();
  readonly deleteHoliday = output<{ oficinaId: number; festivoId: number }>();
  readonly cancel = output<void>();

  /** 'create' o ID numérico de la oficina seleccionada para editar */
  protected readonly activeOfficeId = signal<number | 'create'>('create');
  protected readonly activeTab = signal<OfficeEditorTab>('details');
  protected readonly officeName = signal<string>('');
  protected readonly selectedUserIds = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly userSearch = signal<string>('');

  protected readonly selectedYear = signal<number>(new Date().getFullYear());
  protected readonly holidayDate = signal<string>('');
  protected readonly holidayName = signal<string>('');

  private initialized = false;

  constructor() {
    effect(() => {
      const list = this.offices();
      const active = this.activeOfficeId();
      if (!this.initialized && list.length > 0) {
        this.initialized = true;
        this.selectOfficeForEdit(list[0]);
        return;
      }
      if (typeof active === 'number') {
        const current = list.find((o) => o.id === active);
        if (!current) {
          if (list.length > 0) {
            this.selectOfficeForEdit(list[0]);
          } else {
            this.startCreateOffice();
          }
        } else {
          this.officeName.set(current.nombre);
          this.selectedUserIds.set(new Set<number>(current.usuarioIds));
        }
      }
    });
  }

  ngOnInit(): void {
    const list = this.offices();
    if (list.length > 0) {
      this.initialized = true;
      this.selectOfficeForEdit(list[0]);
    } else {
      this.startCreateOffice();
    }
  }

  protected readonly activeOffice = computed<AdminOffice | null>(() => {
    const active = this.activeOfficeId();
    if (active === 'create') {
      return null;
    }
    return this.offices().find((o) => o.id === active) ?? null;
  });

  protected readonly yearOptions = computed<number[]>(() => {
    const currentYear = new Date().getFullYear();
    const officeYears = (this.activeOffice()?.calendarios ?? []).map((c) => c.anio);
    const set = new Set<number>([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
      ...officeYears,
    ]);
    return [...set].filter((y) => Number.isInteger(y) && y > 1900).sort((a, b) => a - b);
  });

  protected readonly activeYearCalendar = computed<OfficeCalendar | null>(() => {
    const office = this.activeOffice();
    if (!office) {
      return null;
    }
    const year = this.selectedYear();
    return office.calendarios.find((c) => c.anio === year) ?? null;
  });

  protected readonly visibleYearHolidays = computed<
    Array<OfficeHoliday & { formattedDate: string; weekday: string }>
  >(() => {
    const office = this.activeOffice();
    if (!office) {
      return [];
    }
    const year = this.selectedYear();
    return office.festivos
      .filter((h) => h.anio === year || h.fecha.startsWith(`${year}-`))
      .map((h) => {
        const [y, m, d] = h.fecha.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(dateObj);
        const formattedDate = new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(dateObj);
        return {
          ...h,
          formattedDate,
          weekday,
        };
      });
  });

  protected readonly filteredUsers = computed<AdminUser[]>(() => {
    const q = this.userSearch().trim().toLowerCase();
    const all = this.users();
    if (!q) {
      return all;
    }
    return all.filter((u) => {
      const fullName = getUserDisplayName(u).toLowerCase();
      return (
        (u.codigo ?? '').toLowerCase().includes(q) ||
        fullName.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.cargo.toLowerCase().includes(q)
      );
    });
  });

  protected startCreateOffice(): void {
    this.activeOfficeId.set('create');
    this.activeTab.set('details');
    this.officeName.set('');
    this.selectedUserIds.set(new Set<number>());
    this.holidayDate.set('');
    this.holidayName.set('');
  }

  protected selectOfficeForEdit(office: AdminOffice): void {
    this.activeOfficeId.set(office.id);
    this.officeName.set(office.nombre);
    this.selectedUserIds.set(new Set<number>(office.usuarioIds));
  }

  protected isUserSelected(userId: number): boolean {
    return this.selectedUserIds().has(userId);
  }

  protected toggleUser(userId: number): void {
    const next = new Set<number>(this.selectedUserIds());
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    this.selectedUserIds.set(next);
  }

  protected selectAllFilteredUsers(): void {
    const next = new Set<number>(this.selectedUserIds());
    for (const u of this.filteredUsers()) {
      next.add(u.id);
    }
    this.selectedUserIds.set(next);
  }

  protected clearSelectedUsers(): void {
    this.selectedUserIds.set(new Set<number>());
  }

  protected displayName(user: AdminUser): string {
    return getUserDisplayName(user);
  }

  protected initials(user: AdminUser): string {
    return getUserInitials(user);
  }

  protected userColor(user: AdminUser): UserColorPalette {
    return getUserColor(user.id, getUserDisplayName(user));
  }

  protected onYearChange(value: number | string): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 1900) {
      this.selectedYear.set(parsed);
    }
  }

  protected onHolidayDateChange(value: string): void {
    this.holidayDate.set(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const year = Number(value.slice(0, 4));
      if (Number.isInteger(year) && year > 1900) {
        this.selectedYear.set(year);
      }
    }
  }

  protected submitOffice(): void {
    const cleanName = this.officeName().trim();
    if (!cleanName || this.saving()) {
      return;
    }
    const usuarioIds = [...this.selectedUserIds()];
    const active = this.activeOfficeId();

    if (active === 'create') {
      this.createOffice.emit({ nombre: cleanName, usuarioIds });
      this.officeName.set('');
      this.selectedUserIds.set(new Set<number>());
    } else {
      this.updateOffice.emit({
        oficinaId: active,
        nombre: cleanName,
        usuarioIds,
      });
    }
  }

  protected onDeleteOffice(office: AdminOffice, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.saving()) {
      return;
    }
    if (
      confirm(
        `¿Seguro que quieres eliminar la oficina "${office.nombre}"? Se desvincularán sus usuarios y se borrarán sus calendarios y festivos.`
      )
    ) {
      this.deleteOffice.emit(office);
    }
  }

  protected onCreateYearCalendar(): void {
    const office = this.activeOffice();
    if (!office || this.saving()) {
      return;
    }
    this.createCalendar.emit({ oficinaId: office.id, anio: this.selectedYear() });
  }

  protected onDeleteYearCalendar(calendar: OfficeCalendar): void {
    const office = this.activeOffice();
    if (!office || this.saving()) {
      return;
    }
    if (
      confirm(
        `¿Eliminar el calendario ${calendar.anio} de la oficina "${office.nombre}" junto con todos sus días festivos?`
      )
    ) {
      this.deleteCalendar.emit({ oficinaId: office.id, calendarioId: calendar.id });
    }
  }

  protected submitHoliday(): void {
    const office = this.activeOffice();
    const fecha = this.holidayDate().trim();
    const nombre = this.holidayName().trim();
    if (!office || !fecha || !nombre || this.saving()) {
      return;
    }
    this.addHoliday.emit({ oficinaId: office.id, fecha, nombre });
    this.holidayDate.set('');
    this.holidayName.set('');
  }

  protected onDeleteHoliday(holiday: OfficeHoliday): void {
    const office = this.activeOffice();
    if (!office || !holiday.id || this.saving()) {
      return;
    }
    if (confirm(`¿Eliminar el día festivo "${holiday.nombre}" (${holiday.fecha})?`)) {
      this.deleteHoliday.emit({ oficinaId: office.id, festivoId: holiday.id });
    }
  }
}
