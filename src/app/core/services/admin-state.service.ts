import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import {
  AdminUser,
  UserFormPayload,
  getUserDisplayName,
  isUserRequested,
  normalizeUser,
} from '../models/user.model';
import { VacationDay, normalizeVacationEntry } from '../models/vacation.model';
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
  readonly pendingUsers = signal<AdminUser[]>([]);
  readonly vacations = signal<VacationDay[]>([]);
  readonly selectedUserIds = signal<number[]>([]);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  readonly requestedUsers = computed<AdminUser[]>(() =>
    this.rawUsers().filter((user) => isUserRequested(user))
  );

  readonly totalPendingAndRequestedCount = computed<number>(() =>
    this.pendingUsers().length + this.requestedUsers().length
  );

  readonly users = computed<AdminUser[]>(() => {
    const pendingSet = new Set(this.pendingUsers().map((u) => u.id));
    return this.rawUsers().map((user) => ({
      ...user,
      sesionActiva: !pendingSet.has(user.id) && user.estadoSesion !== 'solicitado',
    }));
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
    this.pendingUsers.set([]);
    this.vacations.set([]);
    this.selectedUserIds.set([]);
    this.loading.set(false);
    this.saving.set(false);
    this.notifications.clearAll();
  }

  loadDashboard(): void {
    const token = this.auth.token();
    if (!token) {
      return;
    }

    this.loading.set(true);
    this.notifications.clearError();

    let completed = 0;
    const finish = (): void => {
      completed += 1;
      if (completed === 3) {
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

    // 2. GET /api/usuarios/pendientes (usuarios con invitación enviada en estado 'proceso')
    this.api.getPendingUsers(token).subscribe({
      next: (value) => {
        const parsedPending = extractArray(value, ['usuarios', 'users', 'data'])
          .map((item) => normalizeUser(item))
          .filter((user): user is AdminUser => user !== null)
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

    // 3. GET /api/vacaciones
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
}
