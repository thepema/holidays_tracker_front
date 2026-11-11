import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getVacationTypeLabel } from '../../../../core/models/user.model';
import {
  VacationDay,
  computeInitials,
  formatDateKey,
  normalizeDateKey,
  normalizeVacationEntry,
} from '../../../../core/models/vacation.model';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserSessionService } from '../../../../core/services/user-session.service';
import { extractArray, extractErrorMessage } from '../../../../core/utils/http-helpers';
import { AlertBannerComponent } from '../../../../shared/components/alert-banner/alert-banner.component';

export interface UserCalendarDayCell {
  date: Date | null;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  isRequested: boolean;
  requestedId?: number;
  isSelected: boolean;
  isDragPreview: boolean;
  isEditingOrigin: boolean;
  isEditingTarget: boolean;
  canInteract: boolean;
}

export interface CarouselMonthSheet {
  index: number;
  year: number;
  month: number; // 0..11
  key: string; // YYYY-MM
  title: string;
  shortTitle: string;
  requestedCount: number;
  selectedCount: number;
  cells: UserCalendarDayCell[];
}

export interface RequestedVacationItem {
  id?: number;
  fecha: string;
  formattedDate: string;
  weekdayName: string;
  year: number;
  isPast: boolean;
  isToday: boolean;
  canModify: boolean;
}

type RequestedFilter = 'todos' | 'proximos' | 'pasados';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertBannerComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly userSession = inject(UserSessionService);
  protected readonly notifications = inject(NotificationService);

  readonly sessionExpired = output<void>();

  protected readonly weekDays = [
    { full: 'Lun', short: 'L' },
    { full: 'Mar', short: 'M' },
    { full: 'Mié', short: 'X' },
    { full: 'Jue', short: 'J' },
    { full: 'Vie', short: 'V' },
    { full: 'Sáb', short: 'S' },
    { full: 'Dom', short: 'D' },
  ] as const;

  readonly loading = signal<boolean>(false);
  readonly savingVacations = signal<boolean>(false);

  /** Lista de vacaciones ya pedidas y guardadas en el servidor */
  readonly requestedVacations = signal<VacationDay[]>([]);

  /** Conjunto de fechas (YYYY-MM-DD) seleccionadas en el calendario pendientes de enviar al servidor */
  readonly selectedDatesSet = signal<ReadonlySet<string>>(new Set<string>());

  /** Índice activo del carrousel de calendarios */
  readonly activeCarouselIndex = signal<number>(0);

  /** Modo de vista del carrousel: 1 mes o 2 meses simultáneos */
  readonly visibleMonthsCount = signal<1 | 2>(1);

  /** Estado de arrastre (mantener pulsado el click hacia delante sin fines de semana) */
  readonly isDragging = signal<boolean>(false);
  readonly dragStartKey = signal<string | null>(null);
  readonly dragCurrentKey = signal<string | null>(null);
  private dragMovedAcrossCells = false;

  /** Estado de modificación de un día de vacaciones ya pedido (si aún no ha pasado la fecha) */
  readonly editingVacation = signal<RequestedVacationItem | null>(null);
  readonly editingNewDate = signal<string>('');
  readonly modifyingLoading = signal<boolean>(false);
  readonly deletingId = signal<number | null>(null);

  /** Filtro de la lista de vacaciones pedidas */
  readonly requestedFilter = signal<RequestedFilter>('todos');

  readonly todayKey = computed<string>(() => formatDateKey(new Date()));

  readonly userProfile = computed(() => this.userSession.currentUser());

  readonly userFullName = computed<string>(() => {
    const u = this.userProfile();
    if (!u) return 'Usuario';
    return `${u.nombre} ${u.apellidos}`.trim() || u.nombre;
  });

  readonly userInitials = computed<string>(() => {
    const u = this.userProfile();
    if (!u) return 'US';
    return computeInitials(u.nombre, u.apellidos);
  });

  readonly userVacationTypeLabel = computed<string>(() => {
    const u = this.userProfile();
    if (!u?.tipo_vacaciones) return '';
    return getVacationTypeLabel(u.tipo_vacaciones);
  });

  /**
   * Mapa de fecha (YYYY-MM-DD) -> VacationDay ya pedido en servidor
   */
  readonly requestedByDateMap = computed<ReadonlyMap<string, VacationDay>>(() => {
    const map = new Map<string, VacationDay>();
    for (const v of this.requestedVacations()) {
      if (v.fecha) {
        map.set(v.fecha, v);
      }
    }
    return map;
  });

  /**
   * Fechas en previsualización mientras se mantiene presionado el click y se arrastra hacia delante
   * excluyendo automáticamente fines de semana, fechas pasadas y días ya pedidos.
   */
  readonly dragPreviewDatesSet = computed<ReadonlySet<string>>(() => {
    if (!this.isDragging()) {
      return new Set<string>();
    }
    const start = this.dragStartKey();
    const current = this.dragCurrentKey();
    if (!start || !current) {
      return new Set<string>();
    }

    // Si se mantiene presionado y se mueve hacia delante, seleccionamos todos los días hábiles entre start y current
    const effectiveEnd = current >= start ? current : start;
    const range = this.computeWeekdaysForward(
      start,
      effectiveEnd,
      this.todayKey(),
      this.requestedByDateMap()
    );
    return new Set<string>(range);
  });

  /**
   * Definición de meses del carrousel:
   * - Desde el mes actual hasta final del año actual (diciembre).
   * - Y si estamos en el mes de noviembre (month === 10, o dic), se muestran además los 3 primeros meses del año siguiente (enero, febrero, marzo).
   */
  readonly carouselMonths = computed<CarouselMonthSheet[]>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 = Enero ... 10 = Noviembre, 11 = Diciembre
    const today = this.todayKey();
    const requestedMap = this.requestedByDateMap();
    const selectedSet = this.selectedDatesSet();
    const previewSet = this.dragPreviewDatesSet();
    const editingItem = this.editingVacation();
    const editingTarget = this.editingNewDate();

    const monthSpecs: Array<{ year: number; month: number }> = [];

    // Desde el mes actual hasta diciembre del año en curso
    for (let m = currentMonth; m <= 11; m++) {
      monthSpecs.push({ year: currentYear, month: m });
    }

    // Si estamos en el mes de noviembre (o diciembre), añadimos los 3 primeros meses del año siguiente (Enero, Febrero, Marzo)
    if (currentMonth >= 10) {
      for (let m = 0; m < 3; m++) {
        monthSpecs.push({ year: currentYear + 1, month: m });
      }
    }

    return monthSpecs.map((spec, index) => {
      const firstDay = new Date(spec.year, spec.month, 1);
      const offset = (firstDay.getDay() + 6) % 7; // Lunes = 0 ... Domingo = 6
      const daysInMonth = new Date(spec.year, spec.month + 1, 0).getDate();

      const title = new Intl.DateTimeFormat('es-ES', {
        month: 'long',
        year: 'numeric',
      }).format(firstDay);

      const shortMonth = new Intl.DateTimeFormat('es-ES', {
        month: 'short',
      })
        .format(firstDay)
        .replace('.', '');
      const shortTitle = `${shortMonth} ${spec.year}`;

      const emptyCells: UserCalendarDayCell[] = Array.from({ length: offset }, () => ({
        date: null,
        dayNumber: null,
        dateKey: null,
        isToday: false,
        isPast: false,
        isWeekend: false,
        isRequested: false,
        isSelected: false,
        isDragPreview: false,
        isEditingOrigin: false,
        isEditingTarget: false,
        canInteract: false,
      }));

      let requestedCount = 0;
      let selectedCount = 0;

      const dayCells: UserCalendarDayCell[] = Array.from({ length: daysInMonth }, (_, idx) => {
        const date = new Date(spec.year, spec.month, idx + 1);
        const dateKey = formatDateKey(date);
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isToday = dateKey === today;
        const isPast = dateKey < today;
        const requestedObj = requestedMap.get(dateKey);
        const isRequested = Boolean(requestedObj);
        const isSelected = selectedSet.has(dateKey);
        const isDragPreview = previewSet.has(dateKey);
        const isEditingOrigin = editingItem?.fecha === dateKey;
        const isEditingTarget = Boolean(editingItem && editingTarget === dateKey);

        if (isRequested) requestedCount++;
        if (isSelected) selectedCount++;

        // No se puede pedir dos veces vacaciones en el mismo día, ni en fechas pasadas o fines de semana
        const canInteract = !isPast && !isWeekend && (!isRequested || isEditingOrigin);

        return {
          date,
          dayNumber: idx + 1,
          dateKey,
          isToday,
          isPast,
          isWeekend,
          isRequested,
          requestedId: requestedObj?.id,
          isSelected,
          isDragPreview,
          isEditingOrigin,
          isEditingTarget,
          canInteract,
        };
      });

      return {
        index,
        year: spec.year,
        month: spec.month,
        key: `${spec.year}-${String(spec.month + 1).padStart(2, '0')}`,
        title,
        shortTitle,
        requestedCount,
        selectedCount,
        cells: [...emptyCells, ...dayCells],
      };
    });
  });

  readonly visibleCarouselMonths = computed<CarouselMonthSheet[]>(() => {
    const all = this.carouselMonths();
    if (all.length === 0) return [];
    const count = this.visibleMonthsCount();
    const maxStart = Math.max(0, all.length - count);
    const startIdx = Math.min(Math.max(0, this.activeCarouselIndex()), maxStart);
    return all.slice(startIdx, startIdx + count);
  });

  readonly canGoPrevMonth = computed<boolean>(() => this.activeCarouselIndex() > 0);

  readonly canGoNextMonth = computed<boolean>(() => {
    const total = this.carouselMonths().length;
    const count = this.visibleMonthsCount();
    return this.activeCarouselIndex() + count < total;
  });

  /**
   * Lista ordenada de días seleccionados actualmente en el calendario (borrador para enviar a servidor)
   */
  readonly pendingSelectedList = computed<
    Array<{ dateKey: string; formattedDate: string; weekday: string }>
  >(() => {
    const dates = [...this.selectedDatesSet()].sort();
    return dates.map((dateKey) => {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(dateObj);
      const formattedDate = new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(dateObj);
      return { dateKey, formattedDate, weekday };
    });
  });

  /**
   * Lista procesada de días de vacaciones ya pedidos por el usuario
   */
  readonly requestedVacationItems = computed<RequestedVacationItem[]>(() => {
    const today = this.todayKey();
    const raw = this.requestedVacations();

    const uniqueByDate = new Map<string, VacationDay>();
    for (const item of raw) {
      if (item.fecha && !uniqueByDate.has(item.fecha)) {
        uniqueByDate.set(item.fecha, item);
      }
    }

    const sorted = [...uniqueByDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));

    return sorted.map((v) => {
      const [y, m, d] = v.fecha.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const weekdayName = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(dateObj);
      const formattedDate = new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(dateObj);
      const isPast = v.fecha < today;
      const isToday = v.fecha === today;
      return {
        id: v.id,
        fecha: v.fecha,
        formattedDate,
        weekdayName,
        year: v.anio ?? y,
        isPast,
        isToday,
        canModify: !isPast, // Si aún no ha pasado la fecha podemos modificarlo
      };
    });
  });

  readonly filteredRequestedItems = computed<RequestedVacationItem[]>(() => {
    const all = this.requestedVacationItems();
    const filter = this.requestedFilter();
    if (filter === 'proximos') {
      return all.filter((item) => !item.isPast);
    }
    if (filter === 'pasados') {
      return all.filter((item) => item.isPast);
    }
    return all;
  });

  readonly upcomingRequestedCount = computed<number>(
    () => this.requestedVacationItems().filter((i) => !i.isPast).length
  );

  readonly pastRequestedCount = computed<number>(
    () => this.requestedVacationItems().filter((i) => i.isPast).length
  );

  ngOnInit(): void {
    this.loadUserSessionAndVacations();
  }

  loadUserSessionAndVacations(): void {
    this.loading.set(true);

    // Verificar perfil de sesión si no lo tenemos completo en memoria
    this.api.getCurrentSession().subscribe({
      next: (res) => {
        if (res?.usuario) {
          this.userSession.setProfile(res.usuario);
        }
        this.fetchVacations();
      },
      error: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          this.loading.set(false);
          this.userSession.clearSession();
          this.sessionExpired.emit();
          return;
        }
        // Intentar cargar vacaciones igualmente por si el endpoint /sesiones/me no estuviera disponible
        this.fetchVacations();
      },
    });
  }

  fetchVacations(): void {
    this.loading.set(true);
    this.api.getUserVacations().subscribe({
      next: (rawResponse: unknown) => {
        const rawList = extractArray(rawResponse, ['vacaciones', 'data', 'items', 'fechas']);
        const parsed = rawList.flatMap((entry) => normalizeVacationEntry(entry));
        this.requestedVacations.set(parsed);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          this.userSession.clearSession();
          this.sessionExpired.emit();
          return;
        }
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudieron cargar tus días de vacaciones.')
        );
      },
    });
  }

  // Navegación del Carrousel de Calendarios
  prevCarouselMonth(): void {
    if (this.canGoPrevMonth()) {
      this.activeCarouselIndex.update((i) => Math.max(0, i - 1));
    }
  }

  nextCarouselMonth(): void {
    if (this.canGoNextMonth()) {
      const maxStart = Math.max(0, this.carouselMonths().length - this.visibleMonthsCount());
      this.activeCarouselIndex.update((i) => Math.min(maxStart, i + 1));
    }
  }

  goToCarouselMonth(index: number): void {
    const total = this.carouselMonths().length;
    const count = this.visibleMonthsCount();
    const maxStart = Math.max(0, total - count);
    this.activeCarouselIndex.set(Math.min(Math.max(0, index), maxStart));
  }

  toggleVisibleMonthsCount(count: 1 | 2): void {
    this.visibleMonthsCount.set(count);
    const total = this.carouselMonths().length;
    const maxStart = Math.max(0, total - count);
    if (this.activeCarouselIndex() > maxStart) {
      this.activeCarouselIndex.set(maxStart);
    }
  }

  // ============================================================================
  // Selección de días: Individual (click) o En conjunto hacia delante sin fines
  // de semana (manteniendo presionado el click y arrastrando)
  // ============================================================================

  onDayMouseDown(cell: UserCalendarDayCell, event: MouseEvent): void {
    if (event.button !== 0 || !cell.dateKey) {
      return;
    }

    // Si estamos en modo "Modificar fecha de un día ya pedido", un click en un día hábil futuro libre lo asigna como nueva fecha
    if (this.editingVacation()) {
      if (cell.isPast || cell.isWeekend) {
        return;
      }
      if (cell.isRequested && cell.dateKey !== this.editingVacation()?.fecha) {
        this.notifications.showError('No puedes mover las vacaciones a un día que ya tienes pedido.');
        return;
      }
      event.preventDefault();
      this.editingNewDate.set(cell.dateKey);
      return;
    }

    if (cell.isPast) {
      return;
    }

    if (cell.isRequested) {
      this.notifications.showError('Ese día ya está pedido como vacaciones. No se puede solicitar dos veces el mismo día.');
      return;
    }

    if (cell.isWeekend) {
      return;
    }

    event.preventDefault();
    this.isDragging.set(true);
    this.dragStartKey.set(cell.dateKey);
    this.dragCurrentKey.set(cell.dateKey);
    this.dragMovedAcrossCells = false;
  }

  onDayMouseEnter(cell: UserCalendarDayCell): void {
    if (!this.isDragging() || !cell.dateKey) {
      return;
    }
    const startKey = this.dragStartKey();
    if (!startKey) {
      return;
    }
    if (cell.dateKey !== startKey) {
      this.dragMovedAcrossCells = true;
    }
    // Solo permitimos extender la selección en conjunto hacia delante desde la fecha de inicio
    if (cell.dateKey >= startKey) {
      this.dragCurrentKey.set(cell.dateKey);
    } else {
      this.dragCurrentKey.set(startKey);
    }
  }

  @HostListener('window:mouseup')
  onGlobalMouseUp(): void {
    if (!this.isDragging()) {
      return;
    }

    const startKey = this.dragStartKey();
    const currentKey = this.dragCurrentKey();
    const wasRangeDrag = this.dragMovedAcrossCells && currentKey && startKey && currentKey > startKey;

    this.isDragging.set(false);
    this.dragStartKey.set(null);
    this.dragCurrentKey.set(null);
    this.dragMovedAcrossCells = false;

    if (!startKey) {
      return;
    }

    if (wasRangeDrag && currentKey) {
      // Selección en conjunto hacia delante quitando fines de semana y días ya pedidos
      const weekdays = this.computeWeekdaysForward(
        startKey,
        currentKey,
        this.todayKey(),
        this.requestedByDateMap()
      );
      if (weekdays.length > 0) {
        const nextSet = new Set(this.selectedDatesSet());
        for (const dayKey of weekdays) {
          nextSet.add(dayKey);
        }
        this.selectedDatesSet.set(nextSet);
      }
    } else {
      // Selección individual: alternar el día pulsado
      this.toggleSingleDaySelection(startKey);
    }
  }

  private toggleSingleDaySelection(dateKey: string): void {
    if (dateKey < this.todayKey()) {
      return;
    }
    if (this.requestedByDateMap().has(dateKey)) {
      this.notifications.showError('No se puede pedir dos veces vacaciones en el mismo día.');
      return;
    }
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) {
      return;
    }

    const nextSet = new Set(this.selectedDatesSet());
    if (nextSet.has(dateKey)) {
      nextSet.delete(dateKey);
    } else {
      nextSet.add(dateKey);
    }
    this.selectedDatesSet.set(nextSet);
  }

  private computeWeekdaysForward(
    startKey: string,
    endKey: string,
    todayKey: string,
    requestedMap: ReadonlyMap<string, VacationDay>
  ): string[] {
    if (endKey < startKey) {
      return [];
    }
    const result: string[] = [];
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ey, em, ed] = endKey.split('-').map(Number);
    const cursor = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    while (cursor <= end) {
      const dow = cursor.getDay();
      const key = formatDateKey(cursor);
      const isWeekend = dow === 0 || dow === 6;
      if (!isWeekend && key >= todayKey && !requestedMap.has(key)) {
        result.push(key);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  removePendingDate(dateKey: string): void {
    const nextSet = new Set(this.selectedDatesSet());
    nextSet.delete(dateKey);
    this.selectedDatesSet.set(nextSet);
  }

  clearPendingSelection(): void {
    this.selectedDatesSet.set(new Set<string>());
  }

  /**
   * Envía al servidor la lista de días seleccionados para guardarlos como vacaciones
   */
  submitSelectedVacations(): void {
    const fechas = [...this.selectedDatesSet()].sort();
    if (fechas.length === 0) {
      return;
    }

    // Filtrar por seguridad cualquier día que ya esté en la lista de pedidos
    const requestedMap = this.requestedByDateMap();
    const validFechas = fechas.filter((f) => !requestedMap.has(f));
    if (validFechas.length === 0) {
      this.notifications.showError('Todos los días seleccionados ya estaban registrados como vacaciones.');
      this.clearPendingSelection();
      return;
    }

    this.savingVacations.set(true);
    this.api.saveUserVacations(validFechas).subscribe({
      next: () => {
        this.savingVacations.set(false);
        this.clearPendingSelection();
        this.notifications.showNotice(
          validFechas.length === 1
            ? 'Se ha guardado 1 día de vacaciones correctamente.'
            : `Se han guardado ${validFechas.length} días de vacaciones correctamente.`
        );
        this.fetchVacations();
      },
      error: (err: unknown) => {
        this.savingVacations.set(false);
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudieron guardar los días de vacaciones seleccionados.')
        );
      },
    });
  }

  // ============================================================================
  // Modificación y cancelación de días de vacaciones pedidos (si fecha >= hoy)
  // ============================================================================

  startEditVacation(item: RequestedVacationItem): void {
    if (!item.canModify) {
      return;
    }
    this.editingVacation.set(item);
    this.editingNewDate.set(item.fecha);
  }

  cancelEditVacation(): void {
    this.editingVacation.set(null);
    this.editingNewDate.set('');
  }

  saveModifiedVacation(): void {
    const item = this.editingVacation();
    if (!item || !item.canModify) {
      return;
    }

    const newDate = normalizeDateKey(this.editingNewDate());
    if (!newDate) {
      this.notifications.showError('Selecciona una fecha válida en formato AAAA-MM-DD.');
      return;
    }

    if (newDate === item.fecha) {
      this.cancelEditVacation();
      return;
    }

    if (newDate < this.todayKey()) {
      this.notifications.showError('No puedes cambiar un día de vacaciones a una fecha que ya ha pasado.');
      return;
    }

    const [y, m, d] = newDate.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) {
      this.notifications.showError('No se pueden asignar vacaciones en fin de semana (sábado o domingo).');
      return;
    }

    if (this.requestedByDateMap().has(newDate)) {
      this.notifications.showError('Ya tienes vacaciones pedidas en esa fecha. No se puede pedir dos veces el mismo día.');
      return;
    }

    if (!item.id) {
      this.notifications.showError('Este registro no dispone de identificador para modificarse.');
      return;
    }

    this.modifyingLoading.set(true);
    this.api.updateUserVacationDate(item.id, newDate).subscribe({
      next: () => {
        this.modifyingLoading.set(false);
        this.cancelEditVacation();
        this.notifications.showNotice(`Día de vacaciones actualizado al ${newDate}.`);
        this.fetchVacations();
      },
      error: (err: unknown) => {
        this.modifyingLoading.set(false);
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudo modificar el día de vacaciones.')
        );
      },
    });
  }

  deleteRequestedVacation(item: RequestedVacationItem): void {
    if (!item.canModify || !item.id) {
      return;
    }

    this.deletingId.set(item.id);
    this.api.deleteUserVacation(item.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        if (this.editingVacation()?.id === item.id) {
          this.cancelEditVacation();
        }
        this.notifications.showNotice('Día de vacaciones cancelado y liberado del calendario.');
        this.fetchVacations();
      },
      error: (err: unknown) => {
        this.deletingId.set(null);
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudo cancelar el día de vacaciones.')
        );
      },
    });
  }
}
