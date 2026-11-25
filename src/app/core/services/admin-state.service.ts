import { Injectable, inject, signal } from '@angular/core';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import {
  AdminOffice,
  AdminTeam,
  AdminUser,
  OfficeHoliday,
  UserFormPayload,
  getUserDisplayName,
} from '../models/user.model';
import { VacationDay } from '../models/vacation.model';
import {
  VacationExcelRow,
  downloadVacationsExcel,
  getMonthLabel,
  getVacationDayHours,
} from '../utils/excel-export';
import { extractErrorMessage } from '../utils/http-helpers';
import { AdminSessionsSummaryResponse, ApiService } from './api.service';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class AdminStateService {
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationService);

  private calendarSub: Subscription | null = null;
  private modalSub: Subscription | null = null;
  private activeModalUser: { userId: number; oficinaId: number | null } | null = null;

  // Catálogos y listas servidas completas directamente desde backend (sin cruces en front)
  readonly users = signal<AdminUser[]>([]);
  readonly teams = signal<AdminTeam[]>([]);
  readonly offices = signal<AdminOffice[]>([]);

  // Resumen de sesiones servido directamente desde GET /api/sesiones/resumen
  readonly pendingUsers = signal<AdminUser[]>([]);
  readonly requestedUsers = signal<AdminUser[]>([]);
  readonly totalPendingAndRequestedCount = signal<number>(0);
  readonly authenticatedUsersCount = signal<number>(0);

  // Datos del calendario filtrados en backend por mes, año, equipo y oficina
  readonly calendarYear = signal<number>(new Date().getFullYear());
  readonly calendarMonth = signal<number>(new Date().getMonth() + 1);
  readonly selectedTeamFilter = signal<number | null>(null);
  readonly selectedOfficeFilter = signal<number | null>(null);
  readonly calendarVacations = signal<VacationDay[]>([]);
  readonly calendarHolidays = signal<OfficeHoliday[]>([]);

  // Años con registros en BD para selector de exportación (GET /api/vacaciones/anios)
  readonly availableVacationYears = signal<number[]>([]);

  // Datos cargados bajo demanda para el modal de vacaciones de un usuario concreto
  readonly modalUserVacations = signal<VacationDay[]>([]);
  readonly modalUserHolidays = signal<OfficeHoliday[]>([]);
  readonly modalLoading = signal<boolean>(false);

  // Estados de carga / operación
  readonly loading = signal<boolean>(false);
  readonly calendarLoading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly exporting = signal<boolean>(false);
  readonly sendingReminders = signal<boolean>(false);
  readonly deletingVacationId = signal<number | null>(null);

  reset(): void {
    this.calendarSub?.unsubscribe();
    this.calendarSub = null;
    this.modalSub?.unsubscribe();
    this.modalSub = null;
    this.activeModalUser = null;

    const now = new Date();
    this.users.set([]);
    this.teams.set([]);
    this.offices.set([]);
    this.pendingUsers.set([]);
    this.requestedUsers.set([]);
    this.totalPendingAndRequestedCount.set(0);
    this.authenticatedUsersCount.set(0);
    this.calendarYear.set(now.getFullYear());
    this.calendarMonth.set(now.getMonth() + 1);
    this.selectedTeamFilter.set(null);
    this.selectedOfficeFilter.set(null);
    this.calendarVacations.set([]);
    this.calendarHolidays.set([]);
    this.availableVacationYears.set([]);
    this.modalUserVacations.set([]);
    this.modalUserHolidays.set([]);
    this.modalLoading.set(false);
    this.loading.set(false);
    this.calendarLoading.set(false);
    this.saving.set(false);
    this.exporting.set(false);
    this.sendingReminders.set(false);
    this.deletingVacationId.set(null);
    this.notifications.clearAll();
  }

  setCalendarMonth(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 1900 || !Number.isInteger(month) || month < 1 || month > 12) {
      return;
    }
    this.calendarYear.set(year);
    this.calendarMonth.set(month);
    this.loadCalendarData();
  }

  setTeamFilter(teamId: number | null): void {
    this.selectedTeamFilter.set(teamId);
    this.loadCalendarData();
  }

  setOfficeFilter(officeId: number | null): void {
    this.selectedOfficeFilter.set(officeId);
    this.loadCalendarData();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.notifications.clearError();

    forkJoin({
      usersRes: this.api.getUsers().pipe(
        catchError((error: unknown) => {
          this.notifications.showError(
            extractErrorMessage(error, 'No se pudieron cargar los usuarios.')
          );
          return of(null);
        })
      ),
      teamsRes: this.api.getTeams().pipe(catchError(() => of(null))),
      officesRes: this.api.getOffices().pipe(catchError(() => of(null))),
      sessionsRes: this.api.getSessionsSummary().pipe(
        catchError((error: unknown) => {
          this.notifications.showError(
            extractErrorMessage(error, 'No se pudo cargar el resumen de sesiones.')
          );
          return of(null);
        })
      ),
      yearsRes: this.api.getVacationYears().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ usersRes, teamsRes, officesRes, sessionsRes, yearsRes }) => {
        if (usersRes !== null) {
          this.applyUsersResponse(usersRes);
        }
        if (teamsRes !== null) {
          this.applyTeamsResponse(teamsRes);
        }
        if (officesRes !== null) {
          this.applyOfficesResponse(officesRes);
        }
        if (sessionsRes !== null) {
          this.applySessionsSummaryResponse(sessionsRes);
        }
        if (yearsRes !== null) {
          this.applyVacationYearsResponse(yearsRes);
        }
        this.loading.set(false);
        if (
          usersRes !== null ||
          teamsRes !== null ||
          officesRes !== null ||
          sessionsRes !== null ||
          yearsRes !== null
        ) {
          this.loadCalendarData();
        }
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadCalendarData(): void {
    this.calendarSub?.unsubscribe();
    this.calendarLoading.set(true);

    const anio = this.calendarYear();
    const mes = this.calendarMonth();
    const equipoId = this.selectedTeamFilter();
    const oficinaId = this.selectedOfficeFilter();

    this.calendarSub = forkJoin({
      vacationsRes: this.api
        .getVacations({ anio, mes, equipoId, oficinaId })
        .pipe(
          catchError((error: unknown) => {
            this.notifications.showError(
              extractErrorMessage(error, 'No se pudieron cargar las vacaciones del mes.')
            );
            return of(null);
          })
        ),
      holidaysRes: this.api
        .getAdminHolidays({ anio, mes, equipoId, oficinaId })
        .pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ vacationsRes, holidaysRes }) => {
        if (vacationsRes !== null) {
          this.calendarVacations.set(
            Array.isArray(vacationsRes.vacaciones) ? vacationsRes.vacaciones : []
          );
        }
        if (holidaysRes !== null) {
          this.calendarHolidays.set(Array.isArray(holidaysRes.festivos) ? holidaysRes.festivos : []);
        }
        this.calendarLoading.set(false);
      },
      error: () => {
        this.calendarLoading.set(false);
      },
    });
  }

  loadUserVacationsModalData(userId: number, oficinaId: number | null): void {
    if (!Number.isInteger(userId) || userId < 1) {
      return;
    }

    this.modalSub?.unsubscribe();
    this.activeModalUser = { userId, oficinaId };
    this.modalUserVacations.set([]);
    this.modalUserHolidays.set([]);
    this.modalLoading.set(true);

    this.modalSub = forkJoin({
      vacationsRes: this.api.getVacations({ usuarios: [userId] }).pipe(
        catchError((error: unknown) => {
          this.notifications.showError(
            extractErrorMessage(error, 'No se pudieron cargar las vacaciones del usuario.')
          );
          return of(null);
        })
      ),
      holidaysRes:
        oficinaId !== null && oficinaId > 0
          ? this.api.getAdminHolidays({ oficinaId }).pipe(catchError(() => of(null)))
          : of({ festivos: [] as OfficeHoliday[] }),
    }).subscribe({
      next: ({ vacationsRes, holidaysRes }) => {
        if (vacationsRes !== null) {
          this.modalUserVacations.set(
            Array.isArray(vacationsRes.vacaciones) ? vacationsRes.vacaciones : []
          );
        }
        if (holidaysRes !== null) {
          this.modalUserHolidays.set(Array.isArray(holidaysRes.festivos) ? holidaysRes.festivos : []);
        }
        this.modalLoading.set(false);
      },
      error: () => {
        this.modalLoading.set(false);
      },
    });
  }

  clearUserVacationsModalData(): void {
    this.modalSub?.unsubscribe();
    this.modalSub = null;
    this.activeModalUser = null;
    this.modalUserVacations.set([]);
    this.modalUserHolidays.set([]);
    this.modalLoading.set(false);
  }

  saveUser(
    payload: UserFormPayload,
    editingUserId: number | null,
    onSuccess?: () => void
  ): void {
    this.saving.set(true);

    const request$ =
      editingUserId !== null
        ? this.api.updateUser(editingUserId, payload)
        : this.api.createUser(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice(
          editingUserId === null
            ? 'Usuario creado correctamente.'
            : 'Usuario actualizado correctamente.'
        );
        onSuccess?.();
        this.refreshAfterUserOrStructureChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo guardar el usuario.')
        );
      },
    });
  }

  createTeam(
    nombre: string,
    usuarioIds: number[] = [],
    onSuccess?: (createdTeam?: AdminTeam) => void
  ): void {
    const cleanName = nombre.trim();
    if (!cleanName) {
      this.notifications.showError('El nombre del equipo no puede estar vacío.');
      return;
    }

    this.saving.set(true);

    this.api.createTeam({ nombre: cleanName, usuarioIds }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.notifications.showNotice(`Equipo "${cleanName}" creado correctamente.`);
        onSuccess?.(res?.equipo);
        this.refreshAfterTeamChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo crear el equipo.')
        );
      },
    });
  }

  updateTeam(
    equipoId: number,
    payload: { nombre?: string; usuarioIds?: number[] },
    onSuccess?: () => void
  ): void {
    this.saving.set(true);

    this.api.updateTeam(equipoId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Equipo actualizado correctamente.');
        onSuccess?.();
        this.refreshAfterTeamChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo actualizar el equipo.')
        );
      },
    });
  }

  deleteTeam(equipoId: number, onSuccess?: () => void): void {
    this.saving.set(true);

    this.api.deleteTeam(equipoId).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.selectedTeamFilter() === equipoId) {
          this.selectedTeamFilter.set(null);
        }
        this.notifications.showNotice('Equipo eliminado correctamente.');
        onSuccess?.();
        this.refreshAfterTeamChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo eliminar el equipo.')
        );
      },
    });
  }

  createOffice(
    nombre: string,
    usuarioIds: number[] = [],
    onSuccess?: (createdOffice?: AdminOffice) => void
  ): void {
    const cleanName = nombre.trim();
    if (!cleanName) {
      this.notifications.showError('El nombre de la oficina no puede estar vacío.');
      return;
    }

    this.saving.set(true);

    this.api.createOffice({ nombre: cleanName, usuarioIds }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.notifications.showNotice(`Oficina "${cleanName}" creada correctamente.`);
        onSuccess?.(res?.oficina);
        this.refreshAfterOfficeChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo crear la oficina.')
        );
      },
    });
  }

  updateOffice(
    oficinaId: number,
    payload: { nombre?: string; usuarioIds?: number[] },
    onSuccess?: () => void
  ): void {
    this.saving.set(true);

    this.api.updateOffice(oficinaId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Oficina actualizada correctamente.');
        onSuccess?.();
        this.refreshAfterOfficeChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo actualizar la oficina.')
        );
      },
    });
  }

  deleteOffice(oficinaId: number, onSuccess?: () => void): void {
    this.saving.set(true);

    this.api.deleteOffice(oficinaId).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.selectedOfficeFilter() === oficinaId) {
          this.selectedOfficeFilter.set(null);
        }
        this.notifications.showNotice('Oficina eliminada correctamente.');
        onSuccess?.();
        this.refreshAfterOfficeChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo eliminar la oficina.')
        );
      },
    });
  }

  createOfficeCalendar(
    oficinaId: number,
    anio: number,
    onSuccess?: () => void
  ): void {
    this.saving.set(true);

    this.api.createOfficeCalendar(oficinaId, anio).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice(`Calendario ${anio} habilitado para la oficina.`);
        onSuccess?.();
        this.refreshAfterOfficeChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo crear el calendario anual de la oficina.')
        );
      },
    });
  }

  deleteOfficeCalendar(
    oficinaId: number,
    calendarioId: number,
    onSuccess?: () => void
  ): void {
    this.saving.set(true);

    this.api.deleteOfficeCalendar(oficinaId, calendarioId).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Calendario anual eliminado correctamente.');
        onSuccess?.();
        this.refreshAfterOfficeChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo eliminar el calendario anual.')
        );
      },
    });
  }

  addOfficeHoliday(
    oficinaId: number,
    payload: { fecha: string; nombre: string; anio?: number },
    onSuccess?: () => void
  ): void {
    const cleanDate = payload.fecha.trim();
    const cleanName = payload.nombre.trim();
    if (!cleanDate || !cleanName) {
      this.notifications.showError('Indica la fecha y el nombre del día festivo.');
      return;
    }

    this.saving.set(true);

    this.api
      .addOfficeHoliday(oficinaId, {
        fecha: cleanDate,
        nombre: cleanName,
        ...(payload.anio ? { anio: payload.anio } : {}),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.showNotice(`Festivo "${cleanName}" (${cleanDate}) añadido.`);
          onSuccess?.();
          this.refreshAfterOfficeChange();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notifications.showError(
            extractErrorMessage(error, 'No se pudo añadir el día festivo.')
          );
        },
      });
  }

  deleteOfficeHoliday(
    oficinaId: number,
    festivoId: number,
    onSuccess?: () => void
  ): void {
    this.saving.set(true);

    this.api.deleteOfficeHoliday(oficinaId, festivoId).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Día festivo eliminado correctamente.');
        onSuccess?.();
        this.refreshAfterOfficeChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo eliminar el día festivo.')
        );
      },
    });
  }

  addVacations(
    userId: number,
    rawDatesText: string,
    onSuccess?: () => void
  ): void {
    const dates = [
      ...new Set(
        rawDatesText
          .split(/[\s,;]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    ];

    if (
      !dates.length ||
      dates.length > 366 ||
      dates.some(
        (date) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))
      )
    ) {
      this.notifications.showError(
        'Introduce entre 1 y 366 fechas válidas con formato YYYY-MM-DD.'
      );
      return;
    }

    const weekendDates = dates.filter((date) => {
      const [y, m, d] = date.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      return dow === 0 || dow === 6;
    });
    if (weekendDates.length > 0) {
      this.notifications.showError(
        `No se pueden registrar vacaciones en fin de semana: ${weekendDates.join(', ')}.`
      );
      return;
    }

    const holidayMap = new Map<string, OfficeHoliday>(
      this.modalUserHolidays().map((h) => [h.fecha, h])
    );
    const holidayConflicts = dates
      .map((date) => holidayMap.get(date))
      .filter((h): h is OfficeHoliday => Boolean(h));
    if (holidayConflicts.length > 0) {
      const details = holidayConflicts.map((h) => `${h.fecha} (${h.nombre})`).join(', ');
      this.notifications.showError(
        `No se pueden registrar vacaciones en días festivos de la oficina asignada: ${details}.`
      );
      return;
    }

    this.saving.set(true);
    this.api.addVacations(userId, dates).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Días de vacaciones registrados correctamente.');
        onSuccess?.();
        this.refreshAfterVacationChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudieron registrar las vacaciones.')
        );
      },
    });
  }

  deleteVacation(vacacionId: number, onSuccess?: () => void): void {
    this.deletingVacationId.set(vacacionId);
    this.api.deleteVacationAdmin(vacacionId).subscribe({
      next: () => {
        this.deletingVacationId.set(null);
        this.calendarVacations.update((list) => list.filter((v) => v.id !== vacacionId));
        this.modalUserVacations.update((list) => list.filter((v) => v.id !== vacacionId));
        this.notifications.showNotice('Día de vacaciones eliminado correctamente.');
        onSuccess?.();
        this.refreshAfterVacationChange();
      },
      error: (error: unknown) => {
        this.deletingVacationId.set(null);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo eliminar el día de vacaciones.')
        );
      },
    });
  }

  sendRequestedInvitations(onSuccess?: () => void): void {
    const requested = this.requestedUsers();
    if (!requested.length) {
      return;
    }

    this.saving.set(true);

    const calls$ = requested.map((u) => this.api.inviteUser(u.id));
    forkJoin(calls$).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice(
          `Invitaciones enviadas a los ${requested.length} usuarios con solicitud de reseteo.`
        );
        onSuccess?.();
        this.refreshSessionsAndUsers();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(
            error,
            'Hubo un problema al enviar alguna de las invitaciones a los usuarios solicitados.'
          )
        );
        this.refreshSessionsAndUsers();
      },
    });
  }

  sendBulkInvitations(onSuccess?: () => void): void {
    this.saving.set(true);
    this.api.sendBulkInvitations().subscribe({
      next: (res) => {
        this.saving.set(false);
        const enviadas = res?.enviadas;
        this.notifications.showNotice(
          typeof enviadas === 'number'
            ? `Se han enviado ${enviadas} invitaciones a usuarios sin sesión activa.`
            : 'Se han enviado las invitaciones pendientes.'
        );
        onSuccess?.();
        this.refreshSessionsAndUsers();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudieron enviar las invitaciones.')
        );
      },
    });
  }

  sendVacationReminders(onSuccess?: () => void): void {
    this.sendingReminders.set(true);
    this.notifications.clearError();

    this.api.sendVacationReminders().subscribe({
      next: (res) => {
        this.sendingReminders.set(false);
        const total = typeof res?.total === 'number' ? res.total : 0;
        const enviadas = typeof res?.enviadas === 'number' ? res.enviadas : 0;
        const fallidas = typeof res?.fallidas === 'number' ? res.fallidas : 0;

        if (total === 0) {
          this.notifications.showNotice(
            'No hay usuarios autenticados a los que enviar el recordatorio.'
          );
        } else if (fallidas > 0) {
          this.notifications.showNotice(
            `Recordatorio enviado a ${enviadas} de ${total} usuarios autenticados.`
          );
          this.notifications.showError(
            `No se pudo entregar el correo a ${fallidas} ${fallidas === 1 ? 'usuario' : 'usuarios'}.`
          );
        } else {
          this.notifications.showNotice(
            `Se ha enviado el recordatorio de vacaciones a ${enviadas} ${enviadas === 1 ? 'usuario autenticado' : 'usuarios autenticados'}.`
          );
        }
        onSuccess?.();
      },
      error: (error: unknown) => {
        this.sendingReminders.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo enviar el recordatorio de vacaciones.')
        );
      },
    });
  }

  resendInvitation(user: AdminUser): void {
    this.api.inviteUser(user.id).subscribe({
      next: () => {
        this.notifications.showNotice(`Invitación enviada a ${user.email}.`);
        this.refreshSessionsAndUsers();
      },
      error: (error: unknown) => {
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo enviar la invitación.')
        );
      },
    });
  }

  closeUserSession(user: AdminUser): void {
    const fullName = getUserDisplayName(user);
    if (!confirm(`¿Quieres cerrar la sesión de ${fullName}?`)) {
      return;
    }
    this.api.closeSession(user.id).subscribe({
      next: () => {
        this.notifications.showNotice(`Sesión cerrada para ${fullName}.`);
        this.refreshSessionsAndUsers();
      },
      error: (error: unknown) => {
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo cerrar la sesión.')
        );
      },
    });
  }

  exportVacationsToExcel(
    month: number,
    year: number,
    equipoId: number | null = null,
    onSuccess?: () => void
  ): void {
    this.exporting.set(true);
    this.notifications.clearError();

    this.api
      .getVacations({
        mes: month,
        anio: year,
        ...(equipoId !== null ? { equipoId } : {}),
      })
      .subscribe({
        next: (vacationsRes) => {
          const parsedVacations = Array.isArray(vacationsRes?.vacaciones)
            ? vacationsRes.vacaciones
            : [];

          const selectedTeam =
            equipoId !== null
              ? (this.teams().find((t) => t.id === equipoId) ?? null)
              : null;

          const groupedByUser = new Map<
            number,
            { codigo: string; nombreCompleto: string; dates: Set<string> }
          >();

          for (const vac of parsedVacations) {
            if (!vac.fecha) {
              continue;
            }
            let entry = groupedByUser.get(vac.usuarioId);
            if (!entry) {
              const codigo = (vac.codigo || '').trim() || '-';
              const nombreCompleto =
                `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`.trim() ||
                `Usuario #${vac.usuarioId}`;
              entry = {
                codigo,
                nombreCompleto,
                dates: new Set<string>(),
              };
              groupedByUser.set(vac.usuarioId, entry);
            }
            entry.dates.add(vac.fecha);
          }

          const rows: VacationExcelRow[] = [...groupedByUser.values()]
            .map((entry) => {
              const totalDias = entry.dates.size;
              const totalHoras = [...entry.dates].reduce(
                (sum, fecha) => sum + getVacationDayHours(fecha),
                0
              );
              return {
                codigo: entry.codigo,
                nombreCompleto: entry.nombreCompleto,
                totalHoras,
                totalDias,
              };
            })
            .sort((a, b) => {
              const byName = a.nombreCompleto.localeCompare(b.nombreCompleto, 'es');
              if (byName !== 0) {
                return byName;
              }
              return a.codigo.localeCompare(b.codigo, 'es');
            });

          downloadVacationsExcel(rows, month, year, selectedTeam?.nombre ?? null);
          this.exporting.set(false);

          const monthName = getMonthLabel(month);
          const scopeLabel = selectedTeam ? ` (${selectedTeam.nombre})` : '';
          this.notifications.showNotice(
            rows.length > 0
              ? `Excel de ${monthName} ${year}${scopeLabel} descargado (${rows.length} ${rows.length === 1 ? 'empleado exportado' : 'empleados exportados'}).`
              : `Excel de ${monthName} ${year}${scopeLabel} descargado (sin días de vacaciones registrados en ese mes).`
          );
          onSuccess?.();
        },
        error: (error: unknown) => {
          this.exporting.set(false);
          this.notifications.showError(
            extractErrorMessage(
              error,
              'No se pudieron obtener las vacaciones para exportar el Excel.'
            )
          );
        },
      });
  }

  private refreshAfterUserOrStructureChange(): void {
    forkJoin({
      usersRes: this.api.getUsers().pipe(catchError(() => of(null))),
      teamsRes: this.api.getTeams().pipe(catchError(() => of(null))),
      officesRes: this.api.getOffices().pipe(catchError(() => of(null))),
      sessionsRes: this.api.getSessionsSummary().pipe(catchError(() => of(null))),
    }).subscribe(({ usersRes, teamsRes, officesRes, sessionsRes }) => {
      if (usersRes !== null) this.applyUsersResponse(usersRes);
      if (teamsRes !== null) this.applyTeamsResponse(teamsRes);
      if (officesRes !== null) this.applyOfficesResponse(officesRes);
      if (sessionsRes !== null) this.applySessionsSummaryResponse(sessionsRes);
      this.loadCalendarData();
    });
  }

  private refreshAfterTeamChange(): void {
    forkJoin({
      teamsRes: this.api.getTeams().pipe(catchError(() => of(null))),
      usersRes: this.api.getUsers().pipe(catchError(() => of(null))),
    }).subscribe(({ teamsRes, usersRes }) => {
      if (teamsRes !== null) this.applyTeamsResponse(teamsRes);
      if (usersRes !== null) this.applyUsersResponse(usersRes);
      this.loadCalendarData();
    });
  }

  private refreshAfterOfficeChange(): void {
    forkJoin({
      officesRes: this.api.getOffices().pipe(catchError(() => of(null))),
      usersRes: this.api.getUsers().pipe(catchError(() => of(null))),
    }).subscribe(({ officesRes, usersRes }) => {
      if (officesRes !== null) this.applyOfficesResponse(officesRes);
      if (usersRes !== null) this.applyUsersResponse(usersRes);
      this.loadCalendarData();
    });
  }

  private refreshAfterVacationChange(): void {
    this.loadCalendarData();
    if (this.activeModalUser) {
      this.loadUserVacationsModalData(
        this.activeModalUser.userId,
        this.activeModalUser.oficinaId
      );
    }
    forkJoin({
      usersRes: this.api.getUsers().pipe(catchError(() => of(null))),
      yearsRes: this.api.getVacationYears().pipe(catchError(() => of(null))),
    }).subscribe(({ usersRes, yearsRes }) => {
      if (usersRes !== null) this.applyUsersResponse(usersRes);
      if (yearsRes !== null) this.applyVacationYearsResponse(yearsRes);
    });
  }

  private refreshSessionsAndUsers(): void {
    forkJoin({
      sessionsRes: this.api.getSessionsSummary().pipe(catchError(() => of(null))),
      usersRes: this.api.getUsers().pipe(catchError(() => of(null))),
    }).subscribe(({ sessionsRes, usersRes }) => {
      if (sessionsRes !== null) this.applySessionsSummaryResponse(sessionsRes);
      if (usersRes !== null) this.applyUsersResponse(usersRes);
    });
  }

  private applyUsersResponse(res: { usuarios?: AdminUser[] }): void {
    this.users.set(Array.isArray(res?.usuarios) ? res.usuarios : []);
  }

  private applyTeamsResponse(res: { equipos?: AdminTeam[] }): void {
    const teams = Array.isArray(res?.equipos) ? res.equipos : [];
    this.teams.set(teams);

    const currentFilter = this.selectedTeamFilter();
    if (currentFilter !== null && !teams.some((t) => t.id === currentFilter)) {
      this.selectedTeamFilter.set(null);
    }
  }

  private applyOfficesResponse(res: { oficinas?: AdminOffice[] }): void {
    const offices = Array.isArray(res?.oficinas) ? res.oficinas : [];
    this.offices.set(offices);

    const currentOfficeFilter = this.selectedOfficeFilter();
    if (
      currentOfficeFilter !== null &&
      !offices.some((o) => o.id === currentOfficeFilter)
    ) {
      this.selectedOfficeFilter.set(null);
    }
  }

  private applySessionsSummaryResponse(res: AdminSessionsSummaryResponse): void {
    const pendientes = Array.isArray(res?.pendientes) ? res.pendientes : [];
    const solicitados = Array.isArray(res?.solicitados) ? res.solicitados : [];

    const totalPendientesYSolicitados =
      typeof res?.totalPendientesYSolicitados === 'number'
        ? res.totalPendientesYSolicitados
        : pendientes.length + solicitados.length;
    const totalAutenticados =
      typeof res?.totalAutenticados === 'number' ? res.totalAutenticados : 0;

    this.pendingUsers.set(pendientes);
    this.requestedUsers.set(solicitados);
    this.totalPendingAndRequestedCount.set(totalPendientesYSolicitados);
    this.authenticatedUsersCount.set(totalAutenticados);
  }

  private applyVacationYearsResponse(res: { anios?: number[] }): void {
    const rawYears = Array.isArray(res?.anios) ? res.anios : [];
    const years = rawYears
      .map((y) => Number(y))
      .filter((y) => Number.isInteger(y) && y > 1900)
      .sort((a, b) => b - a);
    this.availableVacationYears.set(years);
  }
}
