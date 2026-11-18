import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AdminOffice,
  AdminTeam,
  AdminUser,
  OfficeHoliday,
  UserFormPayload,
  UserTeamBadge,
  getUserDisplayName,
  isUserRequested,
  normalizeOffice,
  normalizeTeam,
  normalizeUser,
} from '../models/user.model';
import { VacationDay, normalizeVacationEntry } from '../models/vacation.model';
import {
  VacationExcelRow,
  downloadVacationsExcel,
  getMonthLabel,
  getVacationDayHours,
} from '../utils/excel-export';
import { asRecord, extractArray, extractErrorMessage } from '../utils/http-helpers';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class AdminStateService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  private readonly rawUsers = signal<AdminUser[]>([]);
  private readonly rawTeams = signal<AdminTeam[]>([]);
  private readonly rawOffices = signal<AdminOffice[]>([]);
  readonly pendingUsers = signal<AdminUser[]>([]);
  readonly vacations = signal<VacationDay[]>([]);
  readonly selectedTeamFilter = signal<number | null>(null);
  readonly selectedOfficeFilter = signal<number | null>(null);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly exporting = signal<boolean>(false);
  readonly deletingVacationId = signal<number | null>(null);

  readonly offices = computed<AdminOffice[]>(() => {
    const officeMap = new Map<
      number,
      {
        id: number;
        nombre: string;
        userSet: Set<number>;
        calendarios: AdminOffice['calendarios'];
        festivos: AdminOffice['festivos'];
      }
    >();

    for (const o of this.rawOffices()) {
      officeMap.set(o.id, {
        id: o.id,
        nombre: o.nombre,
        userSet: new Set<number>(o.usuarioIds),
        calendarios: o.calendarios,
        festivos: o.festivos,
      });
    }

    for (const u of this.rawUsers()) {
      if (u.oficinaId) {
        const existing = officeMap.get(u.oficinaId);
        if (existing) {
          existing.userSet.add(u.id);
          if (!existing.nombre && u.oficinaNombre) {
            existing.nombre = u.oficinaNombre;
          }
        } else {
          officeMap.set(u.oficinaId, {
            id: u.oficinaId,
            nombre: u.oficinaNombre || `Oficina #${u.oficinaId}`,
            userSet: new Set<number>([u.id]),
            calendarios: [],
            festivos: [],
          });
        }
      }
    }

    return [...officeMap.values()]
      .map((item) => ({
        id: item.id,
        nombre: item.nombre,
        usuarioIds: [...item.userSet],
        calendarios: item.calendarios,
        festivos: item.festivos,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly teams = computed<AdminTeam[]>(() => {
    const teamMap = new Map<number, { id: number; nombre: string; userSet: Set<number> }>();

    for (const t of this.rawTeams()) {
      teamMap.set(t.id, {
        id: t.id,
        nombre: t.nombre,
        userSet: new Set<number>(t.usuarioIds),
      });
    }

    for (const u of this.rawUsers()) {
      for (const badge of u.equipos ?? []) {
        const existing = teamMap.get(badge.id);
        if (existing) {
          existing.userSet.add(u.id);
          if (!existing.nombre && badge.nombre) {
            existing.nombre = badge.nombre;
          }
        } else {
          teamMap.set(badge.id, {
            id: badge.id,
            nombre: badge.nombre || `Equipo #${badge.id}`,
            userSet: new Set<number>([u.id]),
          });
        }
      }
    }

    return [...teamMap.values()]
      .map((item) => ({
        id: item.id,
        nombre: item.nombre,
        usuarioIds: [...item.userSet],
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly availableVacationYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const vac of this.vacations()) {
      const year = Number(vac.fecha.slice(0, 4));
      if (Number.isFinite(year) && year > 1900) {
        years.add(year);
      }
    }
    return [...years].sort((a, b) => b - a);
  });

  readonly requestedUsers = computed<AdminUser[]>(() =>
    this.rawUsers().filter((user) => isUserRequested(user))
  );

  readonly totalPendingAndRequestedCount = computed<number>(() =>
    this.pendingUsers().length + this.requestedUsers().length
  );

  readonly users = computed<AdminUser[]>(() => {
    const pendingSet = new Set(this.pendingUsers().map((u) => u.id));
    const allTeams = this.teams();
    const teamById = new Map<number, AdminTeam>(allTeams.map((t) => [t.id, t]));
    const allOffices = this.offices();
    const officeById = new Map<number, AdminOffice>(allOffices.map((o) => [o.id, o]));

    return this.rawUsers().map((user) => {
      const badgeMap = new Map<number, UserTeamBadge>();
      for (const b of user.equipos ?? []) {
        const known = teamById.get(b.id);
        badgeMap.set(b.id, {
          id: b.id,
          nombre: known?.nombre || b.nombre || `Equipo #${b.id}`,
        });
      }
      for (const t of allTeams) {
        if (t.usuarioIds.includes(user.id) && !badgeMap.has(t.id)) {
          badgeMap.set(t.id, { id: t.id, nombre: t.nombre });
        }
      }

      const equipos = [...badgeMap.values()].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es')
      );
      const equipoIds = equipos.map((e) => e.id);

      const officeFromUser = user.oficinaId ? officeById.get(user.oficinaId) : undefined;
      const officeFromList = allOffices.find((o) => o.usuarioIds.includes(user.id));
      const resolvedOfficeId = user.oficinaId ?? officeFromList?.id ?? null;
      const resolvedOfficeName =
        officeFromUser?.nombre ?? officeFromList?.nombre ?? user.oficinaNombre ?? null;

      return {
        ...user,
        oficinaId: resolvedOfficeId,
        oficinaNombre: resolvedOfficeName,
        equipos,
        equipoIds,
        sesionActiva: !pendingSet.has(user.id) && user.estadoSesion !== 'solicitado',
      };
    });
  });

  readonly calendarUsers = computed<AdminUser[]>(() => {
    const teamId = this.selectedTeamFilter();
    const officeId = this.selectedOfficeFilter();
    let result = this.users();
    if (teamId !== null) {
      result = result.filter((u) => u.equipoIds.includes(teamId));
    }
    if (officeId !== null) {
      result = result.filter((u) => u.oficinaId === officeId);
    }
    return result;
  });

  readonly calendarVacations = computed<VacationDay[]>(() => {
    const teamId = this.selectedTeamFilter();
    const officeId = this.selectedOfficeFilter();
    const allVacations = this.vacations();
    if (teamId === null && officeId === null) {
      return allVacations;
    }

    const allowedUsers = this.calendarUsers();
    const allowedIds = new Set<number>(allowedUsers.map((u) => u.id));
    const allowedNames = new Set<string>(
      allowedUsers.map((u) => getUserDisplayName(u).toLowerCase()).filter(Boolean)
    );

    return allVacations.filter((vac) => {
      if (allowedIds.has(vac.usuarioId)) {
        return true;
      }
      const vacFullName = `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`.trim().toLowerCase();
      return Boolean(vacFullName && allowedNames.has(vacFullName));
    });
  });

  readonly calendarHolidays = computed<OfficeHoliday[]>(() => {
    const officeId = this.selectedOfficeFilter();
    const teamId = this.selectedTeamFilter();
    const allOffices = this.offices();

    if (officeId !== null) {
      return allOffices.find((o) => o.id === officeId)?.festivos ?? [];
    }

    if (teamId !== null) {
      const teamUsers = this.users().filter((u) => u.equipoIds.includes(teamId));
      const officeIds = new Set<number>(
        teamUsers
          .map((u) => u.oficinaId)
          .filter((id): id is number => typeof id === 'number' && id > 0)
      );
      if (officeIds.size > 0) {
        return allOffices
          .filter((o) => officeIds.has(o.id))
          .flatMap((o) => o.festivos)
          .sort(
            (a, b) =>
              a.fecha.localeCompare(b.fecha) ||
              a.oficinaNombre.localeCompare(b.oficinaNombre, 'es')
          );
      }
    }

    return allOffices
      .flatMap((o) => o.festivos)
      .sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          a.oficinaNombre.localeCompare(b.oficinaNombre, 'es')
      );
  });

  readonly userCountByYearMap = computed<Map<number, number>>(() => {
    const yearPrefix = `${new Date().getFullYear()}-`;
    const dateSetByUser = new Map<number, Set<string>>();

    const nameToIdMap = new Map<string, number>();
    for (const user of this.rawUsers()) {
      const fullName = getUserDisplayName(user).toLowerCase();
      if (fullName) {
        nameToIdMap.set(fullName, user.id);
      }
    }

    for (const item of this.vacations()) {
      if (!item.fecha.startsWith(yearPrefix)) {
        continue;
      }
      let targetUserId = item.usuarioId;
      if (!this.rawUsers().some((u) => u.id === targetUserId)) {
        const itemFullName = `${item.nombre ?? ''} ${item.apellidos ?? ''}`.trim().toLowerCase();
        const matchedId = nameToIdMap.get(itemFullName);
        if (matchedId !== undefined) {
          targetUserId = matchedId;
        }
      }

      let set = dateSetByUser.get(targetUserId);
      if (!set) {
        set = new Set<string>();
        dateSetByUser.set(targetUserId, set);
      }
      set.add(item.fecha);
    }

    const countMap = new Map<number, number>();
    for (const [userId, dates] of dateSetByUser.entries()) {
      countMap.set(userId, dates.size);
    }
    return countMap;
  });

  reset(): void {
    this.rawUsers.set([]);
    this.rawTeams.set([]);
    this.rawOffices.set([]);
    this.pendingUsers.set([]);
    this.vacations.set([]);
    this.selectedTeamFilter.set(null);
    this.selectedOfficeFilter.set(null);
    this.loading.set(false);
    this.saving.set(false);
    this.exporting.set(false);
    this.deletingVacationId.set(null);
    this.notifications.clearAll();
  }

  setTeamFilter(teamId: number | null): void {
    this.selectedTeamFilter.set(teamId);
  }

  setOfficeFilter(officeId: number | null): void {
    this.selectedOfficeFilter.set(officeId);
  }

  loadDashboard(): void {
    const token = this.auth.token();
    if (!token) {
      return;
    }

    this.loading.set(true);
    this.notifications.clearError();

    let completed = 0;
    const totalRequests = 5;
    const finish = (): void => {
      completed += 1;
      if (completed === totalRequests) {
        this.loading.set(false);
      }
    };

    // 1. GET /api/usuarios (todos los usuarios excepto rol administrador)
    this.api.getUsers(token).subscribe({
      next: (value) => {
        const parsedUsers = extractArray(value, ['usuarios', 'users', 'data'])
          .map((item) => normalizeUser(item))
          .filter((user): user is AdminUser => user !== null);

        this.rawUsers.set(parsedUsers);
        finish();
      },
      error: (error: unknown) => {
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudieron cargar los usuarios.')
        );
        finish();
      },
    });

    // 2. GET /api/equipos
    this.api.getTeams(token).subscribe({
      next: (value) => {
        const parsedTeams = extractArray(value, ['equipos', 'teams', 'data'])
          .map((item) => normalizeTeam(item))
          .filter((team): team is AdminTeam => team !== null);

        this.rawTeams.set(parsedTeams);

        const currentFilter = this.selectedTeamFilter();
        if (currentFilter !== null && !parsedTeams.some((t) => t.id === currentFilter)) {
          this.selectedTeamFilter.set(null);
        }
        finish();
      },
      error: () => {
        finish();
      },
    });

    // 3. GET /api/usuarios/pendientes (usuarios con invitación enviada en estado 'proceso')
    this.api.getPendingUsers(token).subscribe({
      next: (value) => {
        const parsedPending = extractArray(value, ['usuarios', 'users', 'data'])
          .map((item) => normalizeUser(item))
          .filter((user): user is AdminUser => user !== null)
          .filter((user) => !isUserRequested(user))
          .map((user) => ({ ...user, sesionActiva: false }));

        this.pendingUsers.set(parsedPending);
        finish();
      },
      error: (error: unknown) => {
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudieron cargar los usuarios pendientes.')
        );
        finish();
      },
    });

    // 4. GET /api/vacaciones
    this.api.getVacations(token).subscribe({
      next: (value) => {
        const parsedVacations = extractArray(value, [
          'vacaciones',
          'holidays',
          'data',
          'items',
          'rows',
          'results',
        ]).flatMap((item) => normalizeVacationEntry(item));
        this.vacations.set(parsedVacations);
        finish();
      },
      error: (error: unknown) => {
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudieron cargar las vacaciones.')
        );
        finish();
      },
    });

    // 5. GET /api/oficinas
    this.api.getOffices(token).subscribe({
      next: (value) => {
        const parsedOffices = extractArray(value, ['oficinas', 'offices', 'data'])
          .map((item) => normalizeOffice(item))
          .filter((office): office is AdminOffice => office !== null);

        this.rawOffices.set(parsedOffices);

        const currentOfficeFilter = this.selectedOfficeFilter();
        if (
          currentOfficeFilter !== null &&
          !parsedOffices.some((o) => o.id === currentOfficeFilter)
        ) {
          this.selectedOfficeFilter.set(null);
        }
        finish();
      },
      error: () => {
        finish();
      },
    });
  }

  saveUser(
    payload: UserFormPayload,
    editingUserId: number | null,
    onSuccess?: () => void
  ): void {
    const token = this.auth.token();
    this.saving.set(true);

    const request$ =
      editingUserId !== null
        ? this.api.updateUser(editingUserId, payload, token)
        : this.api.createUser(payload, token);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice(
          editingUserId === null
            ? 'Usuario creado correctamente.'
            : 'Usuario actualizado correctamente.'
        );
        onSuccess?.();
        this.loadDashboard();
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

    const token = this.auth.token();
    this.saving.set(true);

    this.api.createTeam({ nombre: cleanName, usuarioIds }, token).subscribe({
      next: (res) => {
        this.saving.set(false);
        const body = asRecord(res);
        const created = normalizeTeam(body['equipo'] ?? res) ?? undefined;
        this.notifications.showNotice(`Equipo "${cleanName}" creado correctamente.`);
        onSuccess?.(created);
        this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.updateTeam(equipoId, payload, token).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Equipo actualizado correctamente.');
        onSuccess?.();
        this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.deleteTeam(equipoId, token).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.selectedTeamFilter() === equipoId) {
          this.selectedTeamFilter.set(null);
        }
        this.notifications.showNotice('Equipo eliminado correctamente.');
        onSuccess?.();
        this.loadDashboard();
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

    const token = this.auth.token();
    this.saving.set(true);

    this.api.createOffice({ nombre: cleanName, usuarioIds }, token).subscribe({
      next: (res) => {
        this.saving.set(false);
        const body = asRecord(res);
        const created = normalizeOffice(body['oficina'] ?? res) ?? undefined;
        this.notifications.showNotice(`Oficina "${cleanName}" creada correctamente.`);
        onSuccess?.(created);
        this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.updateOffice(oficinaId, payload, token).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Oficina actualizada correctamente.');
        onSuccess?.();
        this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.deleteOffice(oficinaId, token).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.selectedOfficeFilter() === oficinaId) {
          this.selectedOfficeFilter.set(null);
        }
        this.notifications.showNotice('Oficina eliminada correctamente.');
        onSuccess?.();
        this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.createOfficeCalendar(oficinaId, anio, token).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice(`Calendario ${anio} habilitado para la oficina.`);
        onSuccess?.();
        this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.deleteOfficeCalendar(oficinaId, calendarioId, token).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Calendario anual eliminado correctamente.');
        onSuccess?.();
        this.loadDashboard();
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

    const token = this.auth.token();
    this.saving.set(true);

    this.api
      .addOfficeHoliday(
        oficinaId,
        {
          fecha: cleanDate,
          nombre: cleanName,
          ...(payload.anio ? { anio: payload.anio } : {}),
        },
        token
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.showNotice(`Festivo "${cleanName}" (${cleanDate}) añadido.`);
          onSuccess?.();
          this.loadDashboard();
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
    const token = this.auth.token();
    this.saving.set(true);

    this.api.deleteOfficeHoliday(oficinaId, festivoId, token).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Día festivo eliminado correctamente.');
        onSuccess?.();
        this.loadDashboard();
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

    const targetUser = this.users().find((u) => u.id === userId);
    const officeHolidays = targetUser?.oficinaId
      ? (this.offices().find((o) => o.id === targetUser.oficinaId)?.festivos ?? [])
      : [];
    const holidayMap = new Map<string, OfficeHoliday>(
      officeHolidays.map((h) => [h.fecha, h])
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
    this.api.addVacations(userId, dates, this.auth.token()).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Días de vacaciones registrados correctamente.');
        onSuccess?.();
        this.loadDashboard();
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
    const token = this.auth.token();
    if (!token) {
      return;
    }

    this.deletingVacationId.set(vacacionId);
    this.api.deleteVacationAdmin(vacacionId, token).subscribe({
      next: () => {
        this.deletingVacationId.set(null);
        this.vacations.update((list) => list.filter((v) => v.id !== vacacionId));
        this.notifications.showNotice('Día de vacaciones eliminado correctamente.');
        onSuccess?.();
        this.loadDashboard();
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

    const token = this.auth.token();
    this.saving.set(true);

    const calls$ = requested.map((u) => this.api.inviteUser(u.id, token));
    forkJoin(calls$).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice(
          `Invitaciones enviadas a los ${requested.length} usuarios con solicitud de reseteo.`
        );
        onSuccess?.();
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(
            error,
            'Hubo un problema al enviar alguna de las invitaciones a los usuarios solicitados.'
          )
        );
        this.loadDashboard();
      },
    });
  }

  sendBulkInvitations(onSuccess?: () => void): void {
    this.saving.set(true);
    this.api.sendBulkInvitations(this.auth.token()).subscribe({
      next: (res) => {
        this.saving.set(false);
        const body = asRecord(res);
        const enviadas = body['enviadas'];
        this.notifications.showNotice(
          typeof enviadas === 'number'
            ? `Se han enviado ${enviadas} invitaciones a usuarios sin sesión activa.`
            : 'Se han enviado las invitaciones pendientes.'
        );
        onSuccess?.();
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudieron enviar las invitaciones.')
        );
      },
    });
  }

  resendInvitation(user: AdminUser): void {
    this.api.inviteUser(user.id, this.auth.token()).subscribe({
      next: () => {
        this.notifications.showNotice(`Invitación enviada a ${user.email}.`);
        this.loadDashboard();
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
    this.api.closeSession(user.id, this.auth.token()).subscribe({
      next: () => {
        this.notifications.showNotice(`Sesión cerrada para ${fullName}.`);
        this.loadDashboard();
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
    const token = this.auth.token();
    if (!token) {
      return;
    }

    this.exporting.set(true);
    this.notifications.clearError();

    forkJoin({
      usersRes: this.api.getUsers(token),
      teamsRes: this.api.getTeams(token).pipe(catchError(() => of({ equipos: [] }))),
      vacationsRes: this.api.getVacations(token, {
        mes: month,
        anio: year,
        ...(equipoId !== null ? { equipoId } : {}),
      }),
    }).subscribe({
      next: ({ usersRes, teamsRes, vacationsRes }) => {
        const parsedUsers = extractArray(usersRes, ['usuarios', 'users', 'data'])
          .map((item) => normalizeUser(item))
          .filter((user): user is AdminUser => user !== null);

        const parsedTeams = extractArray(teamsRes, ['equipos', 'teams', 'data'])
          .map((item) => normalizeTeam(item))
          .filter((team): team is AdminTeam => team !== null);

        const parsedVacations = extractArray(vacationsRes, [
          'vacaciones',
          'holidays',
          'data',
          'items',
          'rows',
          'results',
        ]).flatMap((item) => normalizeVacationEntry(item));

        this.rawUsers.set(parsedUsers);
        if (parsedTeams.length > 0) {
          this.rawTeams.set(parsedTeams);
        }

        const enrichedUsers = this.users();
        const selectedTeam =
          equipoId !== null
            ? (this.teams().find((t) => t.id === equipoId) ?? null)
            : null;

        const userById = new Map<number, AdminUser>();
        const userByName = new Map<string, AdminUser>();
        for (const user of enrichedUsers) {
          userById.set(user.id, user);
          const fullName = getUserDisplayName(user).toLowerCase();
          if (fullName) {
            userByName.set(fullName, user);
          }
        }

        const allowedTeamUserIds =
          equipoId !== null
            ? new Set<number>([
                ...(selectedTeam?.usuarioIds ?? []),
                ...enrichedUsers
                  .filter((u) => u.equipoIds.includes(equipoId))
                  .map((u) => u.id),
              ])
            : null;

        const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
        const groupedByUser = new Map<
          number,
          { codigo: string; nombreCompleto: string; dates: Set<string> }
        >();

        for (const vac of parsedVacations) {
          if (!vac.fecha || !vac.fecha.startsWith(monthPrefix)) {
            continue;
          }

          const vacFullNameKey = `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`
            .trim()
            .toLowerCase();
          const matchedUser =
            userById.get(vac.usuarioId) ??
            (vacFullNameKey ? userByName.get(vacFullNameKey) : undefined);

          const resolvedUserId = matchedUser?.id ?? vac.usuarioId;

          if (allowedTeamUserIds !== null && !allowedTeamUserIds.has(resolvedUserId)) {
            continue;
          }

          let entry = groupedByUser.get(resolvedUserId);
          if (!entry) {
            const codigo = (matchedUser?.codigo || vac.codigo || '').trim() || '-';
            const nombreCompleto =
              (matchedUser ? getUserDisplayName(matchedUser) : '') ||
              `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`.trim() ||
              `Usuario #${resolvedUserId}`;
            entry = {
              codigo,
              nombreCompleto,
              dates: new Set<string>(),
            };
            groupedByUser.set(resolvedUserId, entry);
          } else if (entry.codigo === '-') {
            const candidateCode = (matchedUser?.codigo || vac.codigo || '').trim();
            if (candidateCode) {
              entry.codigo = candidateCode;
            }
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
}
