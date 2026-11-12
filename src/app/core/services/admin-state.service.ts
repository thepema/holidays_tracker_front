import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AdminTeam,
  AdminUser,
  UserFormPayload,
  UserTeamBadge,
  getUserDisplayName,
  isUserRequested,
  normalizeTeam,
  normalizeUser,
} from '../models/user.model';
import { VacationDay, normalizeVacationEntry } from '../models/vacation.model';
import {
  VacationExcelRow,
  downloadVacationsExcel,
  getMonthLabel,
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
  readonly pendingUsers = signal<AdminUser[]>([]);
  readonly vacations = signal<VacationDay[]>([]);
  readonly selectedUserIds = signal<number[]>([]);
  readonly selectedTeamFilter = signal<number | null>(null);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly exporting = signal<boolean>(false);

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

      return {
        ...user,
        equipos,
        equipoIds,
        sesionActiva: !pendingSet.has(user.id) && user.estadoSesion !== 'solicitado',
      };
    });
  });

  readonly calendarUsers = computed<AdminUser[]>(() => {
    const teamId = this.selectedTeamFilter();
    const allUsers = this.users();
    if (teamId === null) {
      return allUsers;
    }
    return allUsers.filter((u) => u.equipoIds.includes(teamId));
  });

  readonly calendarVacations = computed<VacationDay[]>(() => {
    const teamId = this.selectedTeamFilter();
    const allVacations = this.vacations();
    if (teamId === null) {
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
    this.pendingUsers.set([]);
    this.vacations.set([]);
    this.selectedUserIds.set([]);
    this.selectedTeamFilter.set(null);
    this.loading.set(false);
    this.saving.set(false);
    this.exporting.set(false);
    this.notifications.clearAll();
  }

  setTeamFilter(teamId: number | null): void {
    this.selectedTeamFilter.set(teamId);
  }

  loadDashboard(): void {
    const token = this.auth.token();
    if (!token) {
      return;
    }

    this.loading.set(true);
    this.notifications.clearError();

    let completed = 0;
    const totalRequests = 4;
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

        const previousSelected = this.selectedUserIds();
        this.rawUsers.set(parsedUsers);

        if (previousSelected.length === 0) {
          this.selectedUserIds.set(parsedUsers.map((user) => user.id));
        } else {
          const validIds = new Set(parsedUsers.map((user) => user.id));
          const preserved = previousSelected.filter((id) => validIds.has(id));
          this.selectedUserIds.set(
            preserved.length > 0 ? preserved : parsedUsers.map((user) => user.id)
          );
        }
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
  }

  toggleUserSelection(userId: number, checked: boolean): void {
    const current = this.selectedUserIds();
    if (checked) {
      this.selectedUserIds.set([...new Set([...current, userId])]);
    } else {
      this.selectedUserIds.set(current.filter((id) => id !== userId));
    }
  }

  selectAllUsers(): void {
    this.selectedUserIds.set(this.users().map((u) => u.id));
  }

  clearUserSelection(): void {
    this.selectedUserIds.set([]);
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
        const seenKeys = new Set<string>();
        const rows: VacationExcelRow[] = [];

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

          const uniqueKey = `${resolvedUserId}|${vac.fecha}`;
          if (seenKeys.has(uniqueKey)) {
            continue;
          }
          seenKeys.add(uniqueKey);

          const nombre =
            (matchedUser ? getUserDisplayName(matchedUser) : '') ||
            `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`.trim() ||
            `Usuario #${resolvedUserId}`;
          const correo = (matchedUser?.email || vac.email || '').trim();

          rows.push({
            nombre,
            correo,
            fecha: vac.fecha,
          });
        }

        rows.sort((a, b) => {
          const byDate = a.fecha.localeCompare(b.fecha);
          if (byDate !== 0) {
            return byDate;
          }
          return a.nombre.localeCompare(b.nombre, 'es');
        });

        downloadVacationsExcel(rows, month, year, selectedTeam?.nombre ?? null);
        this.exporting.set(false);

        const monthName = getMonthLabel(month);
        const scopeLabel = selectedTeam ? ` (${selectedTeam.nombre})` : '';
        this.notifications.showNotice(
          rows.length > 0
            ? `Excel de ${monthName} ${year}${scopeLabel} descargado (${rows.length} ${rows.length === 1 ? 'día exportado' : 'días exportados'}).`
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
