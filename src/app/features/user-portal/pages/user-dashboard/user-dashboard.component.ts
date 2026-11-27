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
import { formatDateKey } from '../../../../core/models/vacation.model';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  RequestedVacationItem,
  UserStateService,
} from '../../../../core/services/user-state.service';
import { AlertBannerComponent } from '../../../../shared/components/alert-banner/alert-banner.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { UserSessionFooterComponent } from '../../components/user-session-footer/user-session-footer.component';

export type { RequestedVacationItem };

export interface UserCalendarDayCell {
  date: Date | null;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
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

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [FormsModule, AlertBannerComponent, ModalShellComponent, UserSessionFooterComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private static readonly DRAG_HOLD_DELAY_MS = 500;

  protected readonly state = inject(UserStateService);
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

  /** Índice activo de mes en el calendario */
  readonly activeCarouselIndex = signal<number>(0);

  /** Modo de vista: 1 pantalla principal con vista previa lateral o 2 pantallas simultáneas */
  readonly visibleMonthsCount = signal<1 | 2>(1);

  /**
   * Estado visual de arrastre por rango: solo se activa tras mantener pulsado medio segundo (500 ms)
   */
  readonly isDragging = signal<boolean>(false);
  readonly dragStartKey = signal<string | null>(null);
  readonly dragCurrentKey = signal<string | null>(null);
  private pointerDownKey: string | null = null;
  private lastHoveredKey: string | null = null;
  private dragHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private dragMovedAcrossCells = false;

  /** Estado del apartado de API Key / Agente IA (MCP) */
  readonly mcpModalOpen = signal<boolean>(false);
  readonly copiedField = signal<'token' | 'url' | 'prompt' | null>(null);
  private copiedFieldTimer: ReturnType<typeof setTimeout> | null = null;

  readonly mcpAgentPrompt = computed<string>(() => {
    const tokenDisplay = this.state.apiToken() || '<TU_API_TOKEN>';
    const urlDisplay = this.state.mcpEndpointUrl();
    return `Crea un plugin para conectar el servidor MCP "holidays-tracker" con la URL ${urlDisplay} y autenticación mediante la cabecera x-api-key con el valor ${tokenDisplay}.`;
  });

  /**
   * Fechas en previsualización mientras se mantiene presionado el click (tras 0.5 s) y se arrastra hacia delante
   * excluyendo automáticamente fines de semana, festivos de oficina, fechas pasadas y días ya pedidos.
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
    const range = this.state.computeWeekdaysForward(start, effectiveEnd);
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
    const today = this.state.todayKey();
    const requestedMap = this.state.requestedByDateMap();
    const holidayMap = this.state.holidayByDateMap();
    const selectedSet = this.state.selectedDatesSet();
    const previewSet = this.dragPreviewDatesSet();
    const editingItem = this.state.editingVacation();
    const editingTarget = this.state.editingNewDate();

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
        isHoliday: false,
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
        const holidayObj = holidayMap.get(dateKey);
        const isHoliday = Boolean(holidayObj);
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
        if (!isPast && !isWeekend && !isHoliday && !isRequested) availableWeekdaysCount++;

        const canInteract =
          !isPast && !isWeekend && !isHoliday && (!isRequested || isEditingOrigin);

        return {
          date,
          dayNumber: idx + 1,
          dateKey,
          isToday,
          isPast,
          isWeekend,
          isHoliday,
          ...(holidayObj ? { holidayName: holidayObj.nombre } : {}),
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
    const dates = [...this.state.selectedDatesSet()].sort();
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

  ngOnInit(): void {
    this.state.loadDashboard(() => this.sessionExpired.emit());
  }

  ngOnDestroy(): void {
    this.clearDragHoldTimer();
    this.clearCopiedFieldTimer();
  }

  protected handleRefresh(): void {
    this.state.refreshVacations(() => this.sessionExpired.emit());
  }

  protected handleSubmitVacations(): void {
    this.state.submitSelectedVacations(() => this.sessionExpired.emit());
  }

  protected handleStartEditVacation(item: RequestedVacationItem): void {
    if (this.state.startEditVacation(item)) {
      this.goToDateMonth(item.fecha);
    }
  }

  protected handleSaveModifiedVacation(): void {
    this.state.saveModifiedVacation(() => this.sessionExpired.emit());
  }

  protected handleDeleteVacation(item: RequestedVacationItem): void {
    this.state.deleteRequestedVacation(item, () => this.sessionExpired.emit());
  }

  // ============================================================================
  // Conexión MCP y API Key personal de usuario
  // ============================================================================

  protected openMcpModal(): void {
    this.mcpModalOpen.set(true);
  }

  protected closeMcpModal(): void {
    this.mcpModalOpen.set(false);
  }

  protected handleFetchApiToken(): void {
    this.state.fetchApiToken(() => this.sessionExpired.emit());
  }

  protected copyApiToken(): void {
    const token = this.state.apiToken();
    if (!token) return;
    void this.copyText(token, 'token', 'API Key copiada al portapapeles.');
  }

  protected copyMcpUrl(): void {
    void this.copyText(
      this.state.mcpEndpointUrl(),
      'url',
      'URL del servidor MCP copiada al portapapeles.'
    );
  }

  protected copyAgentPrompt(): void {
    const token = this.state.apiToken();
    if (!token) return;
    void this.copyText(
      this.mcpAgentPrompt(),
      'prompt',
      'Prompt para el agente de IA copiado al portapapeles.'
    );
  }

  private async copyText(
    text: string,
    field: 'token' | 'url' | 'prompt',
    noticeMessage: string
  ): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      this.notifications.showError(
        'Tu navegador no permite copiar automáticamente al portapapeles.'
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.copiedField.set(field);
      this.clearCopiedFieldTimer();
      this.copiedFieldTimer = setTimeout(() => {
        this.copiedFieldTimer = null;
        this.copiedField.set(null);
      }, 2000);
      this.notifications.showNotice(noticeMessage);
    } catch {
      this.notifications.showError('No se pudo copiar al portapapeles.');
    }
  }

  private clearCopiedFieldTimer(): void {
    if (this.copiedFieldTimer !== null) {
      clearTimeout(this.copiedFieldTimer);
      this.copiedFieldTimer = null;
    }
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
    this.state.clearMonthSelection(monthKey);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.mcpModalOpen()) {
      return;
    }

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
    } else if (event.key === 'Escape' && this.state.editingVacation()) {
      this.state.cancelEditVacation();
    }
  }

  // ============================================================================
  // Interacción puntero / arrastre de días en el calendario:
  // - Pulsación rápida (< 500 ms): alterna el día (si ya está seleccionado, lo elimina)
  // - Mantener pulsado >= 500 ms: activa el modo arrastre hacia delante sin fines de semana
  // ============================================================================

  onDayMouseDown(cell: UserCalendarDayCell, sheetIndex: number, event: MouseEvent): void {
    if (event.button !== 0 || !cell.dateKey) {
      return;
    }

    if (!this.isSlideActive(sheetIndex)) {
      event.preventDefault();
      this.goToCarouselMonth(sheetIndex);
      return;
    }

    if (this.state.editingVacation()) {
      if (this.state.selectEditingTargetFromCalendar(cell)) {
        event.preventDefault();
      }
      return;
    }

    if (cell.isPast || cell.isWeekend || cell.isHoliday) {
      return;
    }

    if (cell.isRequested) {
      this.state.notifyAlreadyRequestedCell();
      return;
    }

    event.preventDefault();
    this.clearDragHoldTimer();

    const startDateKey = cell.dateKey;
    this.pointerDownKey = startDateKey;
    this.lastHoveredKey = startDateKey;
    this.dragMovedAcrossCells = false;

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
      if (pressedKey) {
        this.state.toggleSingleDaySelection(pressedKey);
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
      this.state.addRangeSelection(startKey, currentKey);
    } else {
      this.state.toggleSingleDaySelection(startKey);
    }
  }

  private clearDragHoldTimer(): void {
    if (this.dragHoldTimer !== null) {
      clearTimeout(this.dragHoldTimer);
      this.dragHoldTimer = null;
    }
  }
}
