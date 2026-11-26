import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { OfficeHoliday, getVacationTypeLabel } from '../models/user.model';
import { VacationDay, computeInitials, formatDateKey } from '../models/vacation.model';
import { extractErrorMessage } from '../utils/http-helpers';
import { ApiService } from './api.service';
import { NotificationService } from './notification.service';
import { UserSessionService } from './user-session.service';

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

export type RequestedFilter = 'todos' | 'proximos' | 'pasados';

@Injectable({ providedIn: 'root' })
export class UserStateService {
  private readonly api = inject(ApiService);
  private readonly userSession = inject(UserSessionService);
  private readonly notifications = inject(NotificationService);

  private loadSub: Subscription | null = null;
  private cookieCheckSub: Subscription | null = null;

  // Catálogos y datos del usuario servidos desde backend
  readonly requestedVacations = signal<VacationDay[]>([]);
  readonly officeHolidays = signal<OfficeHoliday[]>([]);
  readonly userOfficeName = signal<string | null>(null);

  // Borrador de selección de fechas (YYYY-MM-DD) y filtros de gestión
  readonly selectedDatesSet = signal<ReadonlySet<string>>(new Set<string>());
  readonly requestedFilter = signal<RequestedFilter>('todos');

  // Edición inline de un día de vacaciones ya registrado
  readonly editingVacation = signal<RequestedVacationItem | null>(null);
  readonly editingNewDate = signal<string>('');

  // Estados de carga / operación
  readonly checkingCookie = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly savingVacations = signal<boolean>(false);
  readonly modifyingLoading = signal<boolean>(false);
  readonly deletingId = signal<number | null>(null);
  readonly apiToken = signal<string | null>(null);
  readonly loadingApiToken = signal<boolean>(false);

  // Estado derivado de sesión y perfil
  readonly mcpEndpointUrl = computed<string>(() => this.api.getMcpEndpointUrl());
  readonly todayKey = computed<string>(() => formatDateKey(new Date()));
  readonly isAuthenticated = computed<boolean>(() => this.userSession.isAuthenticated());
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

  // Mapas indexados por fecha (YYYY-MM-DD) para consulta rápida O(1)
  readonly requestedByDateMap = computed<ReadonlyMap<string, VacationDay>>(() => {
    const map = new Map<string, VacationDay>();
    for (const v of this.requestedVacations()) {
      if (v.fecha) {
        map.set(v.fecha, v);
      }
    }
    return map;
  });

  readonly holidayByDateMap = computed<ReadonlyMap<string, OfficeHoliday>>(() => {
    const map = new Map<string, OfficeHoliday>();
    for (const h of this.officeHolidays()) {
      if (h.fecha) {
        map.set(h.fecha, h);
      }
    }
    return map;
  });

  // Historial procesado y filtrado de vacaciones solicitadas
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

  reset(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = null;
    this.cookieCheckSub?.unsubscribe();
    this.cookieCheckSub = null;

    this.requestedVacations.set([]);
    this.officeHolidays.set([]);
    this.userOfficeName.set(null);
    this.selectedDatesSet.set(new Set<string>());
    this.requestedFilter.set('todos');
    this.editingVacation.set(null);
    this.editingNewDate.set('');
    this.checkingCookie.set(false);
    this.loading.set(false);
    this.savingVacations.set(false);
    this.modifyingLoading.set(false);
    this.deletingId.set(null);
    this.apiToken.set(null);
    this.loadingApiToken.set(false);
    this.notifications.clearAll();
  }

  verifyInitialCookieSession(): void {
    if (this.userSession.isAuthenticated()) {
      return;
    }

    this.cookieCheckSub?.unsubscribe();
    this.checkingCookie.set(true);

    this.cookieCheckSub = this.api.getCurrentSession().subscribe({
      next: (res) => {
        if (res?.autenticado && res?.usuario) {
          this.userSession.saveSession(res.usuario, 'cookie-ht-session');
        }
        this.checkingCookie.set(false);
      },
      error: () => {
        this.checkingCookie.set(false);
      },
    });
  }

  onSessionRecovered(): void {
    this.checkingCookie.set(false);
  }

  expireSession(): void {
    this.userSession.clearSession();
    this.reset();
  }

  loadDashboard(onSessionExpired?: () => void): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);

    let unauthorized = false;

    this.loadSub = forkJoin({
      sessionRes: this.api.getCurrentSession().pipe(
        catchError((err: unknown) => {
          if (this.isUnauthorizedError(err)) {
            unauthorized = true;
          }
          return of(null);
        })
      ),
      vacationsRes: this.api.getUserVacations().pipe(
        catchError((err: unknown) => {
          if (this.isUnauthorizedError(err)) {
            unauthorized = true;
          } else {
            this.notifications.showError(
              extractErrorMessage(err, 'No se pudieron cargar tus días de vacaciones.')
            );
          }
          return of(null);
        })
      ),
      holidaysRes: this.api.getUserHolidays().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ sessionRes, vacationsRes, holidaysRes }) => {
        if (unauthorized) {
          this.handleUnauthorized(onSessionExpired);
          return;
        }
        if (sessionRes?.usuario) {
          this.userSession.setProfile(sessionRes.usuario);
        }
        if (vacationsRes !== null) {
          this.requestedVacations.set(
            Array.isArray(vacationsRes.vacaciones) ? vacationsRes.vacaciones : []
          );
        }
        if (holidaysRes !== null) {
          const officeName = (holidaysRes.oficinaNombre ?? '').trim();
          this.userOfficeName.set(officeName || null);
          this.officeHolidays.set(
            Array.isArray(holidaysRes.festivos) ? holidaysRes.festivos : []
          );
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  refreshVacations(onSessionExpired?: () => void): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);

    let unauthorized = false;

    this.loadSub = forkJoin({
      vacationsRes: this.api.getUserVacations().pipe(
        catchError((err: unknown) => {
          if (this.isUnauthorizedError(err)) {
            unauthorized = true;
          } else {
            this.notifications.showError(
              extractErrorMessage(err, 'No se pudieron cargar tus días de vacaciones.')
            );
          }
          return of(null);
        })
      ),
      holidaysRes: this.api.getUserHolidays().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ vacationsRes, holidaysRes }) => {
        if (unauthorized) {
          this.handleUnauthorized(onSessionExpired);
          return;
        }
        if (vacationsRes !== null) {
          this.requestedVacations.set(
            Array.isArray(vacationsRes.vacaciones) ? vacationsRes.vacaciones : []
          );
        }
        if (holidaysRes !== null) {
          const officeName = (holidaysRes.oficinaNombre ?? '').trim();
          this.userOfficeName.set(officeName || null);
          this.officeHolidays.set(
            Array.isArray(holidaysRes.festivos) ? holidaysRes.festivos : []
          );
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  // ============================================================================
  // Selección de fechas y reglas de negocio del calendario
  // ============================================================================

  setRequestedFilter(filter: RequestedFilter): void {
    this.requestedFilter.set(filter);
  }

  computeWeekdaysForward(startKey: string, endKey: string): string[] {
    if (endKey < startKey) {
      return [];
    }
    const todayKey = this.todayKey();
    const requestedMap = this.requestedByDateMap();
    const holidayMap = this.holidayByDateMap();

    const result: string[] = [];
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ey, em, ed] = endKey.split('-').map(Number);
    const cursor = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    while (cursor <= end) {
      const dow = cursor.getDay();
      const key = formatDateKey(cursor);
      const isWeekend = dow === 0 || dow === 6;
      if (!isWeekend && key >= todayKey && !requestedMap.has(key) && !holidayMap.has(key)) {
        result.push(key);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  toggleSingleDaySelection(dateKey: string): void {
    if (dateKey < this.todayKey()) {
      return;
    }
    if (this.holidayByDateMap().has(dateKey)) {
      this.notifications.showError('No se pueden solicitar vacaciones en un día festivo de tu oficina.');
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

  addRangeSelection(startKey: string, endKey: string): void {
    const weekdays = this.computeWeekdaysForward(startKey, endKey);
    if (weekdays.length === 0) {
      return;
    }
    const nextSet = new Set(this.selectedDatesSet());
    for (const dayKey of weekdays) {
      nextSet.add(dayKey);
    }
    this.selectedDatesSet.set(nextSet);
  }

  removePendingDate(dateKey: string): void {
    const nextSet = new Set(this.selectedDatesSet());
    nextSet.delete(dateKey);
    this.selectedDatesSet.set(nextSet);
  }

  clearMonthSelection(monthKey: string): void {
    const prefix = `${monthKey}-`;
    const nextSet = new Set<string>();
    for (const d of this.selectedDatesSet()) {
      if (!d.startsWith(prefix)) {
        nextSet.add(d);
      }
    }
    this.selectedDatesSet.set(nextSet);
  }

  clearPendingSelection(): void {
    this.selectedDatesSet.set(new Set<string>());
  }

  notifyAlreadyRequestedCell(): void {
    this.notifications.showError(
      'Ese día ya está pedido como vacaciones. No se puede solicitar dos veces el mismo día.'
    );
  }

  // ============================================================================
  // Registro, modificación y cancelación de vacaciones en servidor
  // ============================================================================

  submitSelectedVacations(onSessionExpired?: () => void): void {
    const fechas = [...this.selectedDatesSet()].sort();
    if (fechas.length === 0) {
      return;
    }

    const requestedMap = this.requestedByDateMap();
    const holidayMap = this.holidayByDateMap();
    const validFechas = fechas.filter((f) => !requestedMap.has(f) && !holidayMap.has(f));
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
        this.refreshVacations(onSessionExpired);
      },
      error: (err: unknown) => {
        this.savingVacations.set(false);
        if (this.isUnauthorizedError(err)) {
          this.handleUnauthorized(onSessionExpired);
          return;
        }
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudieron guardar los días de vacaciones seleccionados.')
        );
      },
    });
  }

  startEditVacation(item: RequestedVacationItem): boolean {
    if (!item.canModify) {
      return false;
    }
    this.editingVacation.set(item);
    this.editingNewDate.set(item.fecha);
    return true;
  }

  setEditingNewDate(value: string): void {
    this.editingNewDate.set(value);
  }

  selectEditingTargetFromCalendar(cell: {
    dateKey: string | null;
    isPast: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
    isRequested: boolean;
  }): boolean {
    if (!cell.dateKey || cell.isPast || cell.isWeekend) {
      return false;
    }
    if (cell.isHoliday) {
      this.notifications.showError(
        `No puedes mover las vacaciones a un día festivo (${cell.holidayName || 'Festivo'}).`
      );
      return false;
    }
    if (cell.isRequested && cell.dateKey !== this.editingVacation()?.fecha) {
      this.notifications.showError(
        'No puedes mover las vacaciones a un día que ya tienes pedido.'
      );
      return false;
    }
    this.editingNewDate.set(cell.dateKey);
    return true;
  }

  cancelEditVacation(): void {
    this.editingVacation.set(null);
    this.editingNewDate.set('');
  }

  saveModifiedVacation(onSessionExpired?: () => void): void {
    const item = this.editingVacation();
    if (!item || !item.canModify) {
      return;
    }

    const newDate = this.editingNewDate().trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
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

    const holidayConflict = this.holidayByDateMap().get(newDate);
    if (holidayConflict) {
      this.notifications.showError(
        `No puedes mover las vacaciones al ${newDate} porque es día festivo en tu oficina (${holidayConflict.nombre}).`
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
        this.refreshVacations(onSessionExpired);
      },
      error: (err: unknown) => {
        this.modifyingLoading.set(false);
        if (this.isUnauthorizedError(err)) {
          this.handleUnauthorized(onSessionExpired);
          return;
        }
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudo modificar el día de vacaciones.')
        );
      },
    });
  }

  deleteRequestedVacation(item: RequestedVacationItem, onSessionExpired?: () => void): void {
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
        this.refreshVacations(onSessionExpired);
      },
      error: (err: unknown) => {
        this.deletingId.set(null);
        if (this.isUnauthorizedError(err)) {
          this.handleUnauthorized(onSessionExpired);
          return;
        }
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudo cancelar el día de vacaciones.')
        );
      },
    });
  }

  fetchApiToken(onSessionExpired?: () => void): void {
    if (this.loadingApiToken()) {
      return;
    }

    this.loadingApiToken.set(true);
    this.api.getUserApiToken().subscribe({
      next: (res) => {
        this.loadingApiToken.set(false);
        this.apiToken.set(res.apiToken);
      },
      error: (err: unknown) => {
        this.loadingApiToken.set(false);
        if (this.isUnauthorizedError(err)) {
          this.handleUnauthorized(onSessionExpired);
          return;
        }
        this.notifications.showError(
          extractErrorMessage(err, 'No se pudo obtener tu API token.')
        );
      },
    });
  }

  private isUnauthorizedError(err: unknown): boolean {
    return (err as { status?: number })?.status === 401;
  }

  private handleUnauthorized(onSessionExpired?: () => void): void {
    this.expireSession();
    onSessionExpired?.();
  }
}
