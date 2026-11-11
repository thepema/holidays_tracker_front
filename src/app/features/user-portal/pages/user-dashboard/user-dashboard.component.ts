import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
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
  availableWeekdaysCount: number;
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
export class UserDashboardComponent implements OnInit, OnDestroy {
  private static readonly DRAG_HOLD_DELAY_MS = 500;

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

  /** Índice activo de mes en el calendario */
  readonly activeCarouselIndex = signal<number>(0);

  /** Modo de vista: 1 pantalla principal con vista previa lateral o 2 pantallas simultáneas */
  readonly visibleMonthsCount = signal<1 | 2>(1);

  /**
   * Estado de arrastre por rango: solo se activa tras mantener pulsado medio segundo (500 ms)
   */
  readonly isDragging = signal<boolean>(false);
  readonly dragStartKey = signal<string | null>(null);
  readonly dragCurrentKey = signal<string | null>(null);
  private pointerDownKey: string | null = null;
  private lastHoveredKey: string | null = null;
  private dragHoldTimer: ReturnType<typeof setTimeout> | null = null;
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
   * Fechas en previsualización mientras se mantiene presionado el click (tras 0.5 s) y se arrastra hacia delante
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
   * Definición de meses disponibles:
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

    for (let m = currentMonth; m <= 11; m++) {
      monthSpecs.push({ year: currentYear, month: m });
    }

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
      let availableWeekdaysCount = 0;

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
        if (!isPast && !isWeekend && !isRequested) availableWeekdaysCount++;

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
        availableWeekdaysCount,
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

  readonly prevMonthSheet = computed<CarouselMonthSheet | null>(() => {
    const idx = this.activeCarouselIndex() - 1;
    const all = this.carouselMonths();
    return idx >= 0 && idx < all.length ? all[idx] : null;
  });

  readonly nextMonthSheet = computed<CarouselMonthSheet | null>(() => {
    const idx = this.activeCarouselIndex() + this.visibleMonthsCount();
    const all = this.carouselMonths();
    return idx >= 0 && idx < all.length ? all[idx] : null;
  });

  readonly canGoPrevMonth = computed<boolean>(() => this.activeCarouselIndex() > 0);

  readonly canGoNextMonth = computed<boolean>(() => {
    const total = this.carouselMonths().length;
    const count = this.visibleMonthsCount();
    return this.activeCarouselIndex() + count < total;
  });

  readonly firstSelectedMonthIndex = computed<number | null>(() => {
    const found = this.carouselMonths().find((m) => m.selectedCount > 0);
    return found ? found.index : null;
  });

  /**
   * Lista ordenada de días seleccionados actualmente en el calendario (borrador para enviar a servidor)
   */
  readonly pendingSelectedList = computed<
    Array<{ dateKey: string; formattedDate: string; weekday: string; monthIndex: number | null }>
  >(() => {
    const dates = [...this.selectedDatesSet()].sort();
    const months = this.carouselMonths();
    return dates.map((dateKey) => {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(dateObj);
      const formattedDate = new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(dateObj);
      const monthKey = dateKey.slice(0, 7);
      const matchingMonth = months.find((sheet) => sheet.key === monthKey);
      return {
        dateKey,
        formattedDate,
        weekday,
        monthIndex: matchingMonth ? matchingMonth.index : null,
      };
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
        canModify: !isPast,
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

  ngOnDestroy(): void {
    this.clearDragHoldTimer();
  }

  loadUserSessionAndVacations(): void {
    this.loading.set(true);

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

  // ============================================================================
  // Navegación y Atajos de Meses
  // ============================================================================

  isSlideActive(index: number): boolean {
    const start = this.activeCarouselIndex();
    const count = this.visibleMonthsCount();
    return index >= start && index < start + count;
  }

  isSlidePrevPeek(index: number): boolean {
    return index === this.activeCarouselIndex() - 1;
  }

  isSlideNextPeek(index: number): boolean {
    return index === this.activeCarouselIndex() + this.visibleMonthsCount();
  }

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

  goToCurrentMonth(): void {
    this.goToCarouselMonth(0);
  }

  goToFirstSelectedMonth(): void {
    const idx = this.firstSelectedMonthIndex();
    if (idx !== null) {
      this.goToCarouselMonth(idx);
    }
  }

  goToDateMonth(dateKey: string): void {
    const monthKey = dateKey.slice(0, 7);
    const found = this.carouselMonths().find((m) => m.key === monthKey);
    if (found) {
      this.goToCarouselMonth(found.index);
    }
  }

  toggleVisibleMonthsCount(count: 1 | 2): void {
    this.visibleMonthsCount.set(count);
    const total = this.carouselMonths().length;
    const maxStart = Math.max(0, total - count);
    if (this.activeCarouselIndex() > maxStart) {
      this.activeCarouselIndex.set(maxStart);
    }
  }

  onScreenCardClick(sheet: CarouselMonthSheet, event: MouseEvent): void {
    if (!this.isSlideActive(sheet.index)) {
      event.stopPropagation();
      this.goToCarouselMonth(sheet.index);
    }
  }

  clearMonthSelection(monthKey: string, event?: MouseEvent): void {
    event?.stopPropagation();
    const prefix = `${monthKey}-`;
    const nextSet = new Set<string>();
    for (const d of this.selectedDatesSet()) {
      if (!d.startsWith(prefix)) {
        nextSet.add(d);
      }
    }
    this.selectedDatesSet.set(nextSet);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevCarouselMonth();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextCarouselMonth();
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.goToCurrentMonth();
    } else if (event.key === 'Escape' && this.editingVacation()) {
      this.cancelEditVacation();
    }
  }

  // ============================================================================
  // Selección de días:
  // - Pulsación rápida (< 500 ms): alterna el día (si ya está seleccionado, lo elimina)
  // - Mantener pulsado >= 500 ms: activa el modo arrastre hacia delante sin fines de semana
  // ============================================================================

  onDayMouseDown(cell: UserCalendarDayCell, sheetIndex: number, event: MouseEvent): void {
    if (event.button !== 0 || !cell.dateKey) {
      return;
    }

    // Si el usuario hace click sobre una pantalla lateral en vista previa, enfocamos ese mes
    if (!this.isSlideActive(sheetIndex)) {
      event.preventDefault();
      this.goToCarouselMonth(sheetIndex);
      return;
    }

    // Si estamos en modo "Modificar fecha de un día ya pedido", un click en un día hábil futuro libre lo asigna como nueva fecha
    if (this.editingVacation()) {
      if (cell.isPast || cell.isWeekend) {
        return;
      }
      if (cell.isRequested && cell.dateKey !== this.editingVacation()?.fecha) {
        this.notifications.showError(
          'No puedes mover las vacaciones a un día que ya tienes pedido.'
        );
        return;
      }
      event.preventDefault();
      this.editingNewDate.set(cell.dateKey);
      return;
    }

    if (cell.isPast || cell.isWeekend) {
      return;
    }

    if (cell.isRequested) {
      this.notifications.showError(
        'Ese día ya está pedido como vacaciones. No se puede solicitar dos veces el mismo día.'
      );
      return;
    }

    event.preventDefault();
    this.clearDragHoldTimer();

    const startDateKey = cell.dateKey;
    this.pointerDownKey = startDateKey;
    this.lastHoveredKey = startDateKey;
    this.dragMovedAcrossCells = false;

    // Esperar medio segundo (500 ms) antes de activar el modo arrastre
    this.dragHoldTimer = setTimeout(() => {
      this.dragHoldTimer = null;
      if (!this.pointerDownKey) {
        return;
      }
      this.isDragging.set(true);
      this.dragStartKey.set(this.pointerDownKey);
      const hovered = this.lastHoveredKey;
      if (hovered && hovered >= this.pointerDownKey) {
        this.dragCurrentKey.set(hovered);
        if (hovered !== this.pointerDownKey) {
          this.dragMovedAcrossCells = true;
        }
      } else {
        this.dragCurrentKey.set(this.pointerDownKey);
      }
    }, UserDashboardComponent.DRAG_HOLD_DELAY_MS);
  }

  onDayMouseEnter(cell: UserCalendarDayCell): void {
    if (!cell.dateKey) {
      return;
    }
    this.lastHoveredKey = cell.dateKey;

    if (!this.isDragging()) {
      return;
    }
    const startKey = this.dragStartKey();
    if (!startKey) {
      return;
    }
    if (cell.dateKey !== startKey) {
      this.dragMovedAcrossCells = true;
    }
    if (cell.dateKey >= startKey) {
      this.dragCurrentKey.set(cell.dateKey);
    } else {
      this.dragCurrentKey.set(startKey);
    }
  }

  @HostListener('window:mouseup')
  onGlobalMouseUp(): void {
    const hadPendingPress = this.pointerDownKey !== null;
    const pressedKey = this.pointerDownKey;
    const wasDragging = this.isDragging();

    this.clearDragHoldTimer();
    this.pointerDownKey = null;
    this.lastHoveredKey = null;

    if (!hadPendingPress && !wasDragging) {
      return;
    }

    if (!wasDragging) {
      // Se soltó antes de medio segundo: pulsación individual (añade o elimina si ya estaba seleccionado)
      if (pressedKey) {
        this.toggleSingleDaySelection(pressedKey);
      }
      return;
    }

    const startKey = this.dragStartKey();
    const currentKey = this.dragCurrentKey();
    const wasRangeDrag =
      this.dragMovedAcrossCells && currentKey && startKey && currentKey > startKey;

    this.isDragging.set(false);
    this.dragStartKey.set(null);
    this.dragCurrentKey.set(null);
    this.dragMovedAcrossCells = false;

    if (!startKey) {
      return;
    }

    if (wasRangeDrag && currentKey) {
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
      // Si mantuvo pulsado en la misma casilla sin arrastrar a otra, alterna también esa casilla
      this.toggleSingleDaySelection(startKey);
    }
  }

  private clearDragHoldTimer(): void {
    if (this.dragHoldTimer !== null) {
      clearTimeout(this.dragHoldTimer);
      this.dragHoldTimer = null;
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

    const requestedMap = this.requestedByDateMap();
    const validFechas = fechas.filter((f) => !requestedMap.has(f));
    if (validFechas.length === 0) {
      this.notifications.showError(
        'Todos los días seleccionados ya estaban registrados como vacaciones.'
      );
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
    this.goToDateMonth(item.fecha);
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
      this.notifications.showError(
        'No puedes cambiar un día de vacaciones a una fecha que ya ha pasado.'
      );
      return;
    }

    const [y, m, d] = newDate.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) {
      this.notifications.showError(
        'No se pueden asignar vacaciones en fin de semana (sábado o domingo).'
      );
      return;
    }

    if (this.requestedByDateMap().has(newDate)) {
      this.notifications.showError(
        'Ya tienes vacaciones pedidas en esa fecha. No se puede pedir dos veces el mismo día.'
      );
      return;
    }

    if (!item.id) {
      this.notifications.showError(
        'Este registro no dispone de identificador para modificarse.'
      );
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
