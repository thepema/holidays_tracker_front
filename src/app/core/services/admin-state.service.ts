import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AdminUser,
  UserFormPayload,
  getUserDisplayName,
  hasActiveSession,
  hasSessionRequest,
  isUserPending,
  normalizeUser,
} from '../models/user.model';
import { VacationDay, normalizeVacation } from '../models/vacation.model';
import { extractArray, extractErrorMessage } from '../utils/http-helpers';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class AdminStateService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  readonly users = signal<AdminUser[]>([]);
  readonly vacations = signal<VacationDay[]>([]);
  readonly selectedUserIds = signal<number[]>([]);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  readonly pendingUsers = computed<AdminUser[]>(() =>
    this.users().filter((user) => isUserPending(user))
  );

  readonly requestUsers = computed<AdminUser[]>(() =>
    this.users().filter((user) => hasSessionRequest(user))
  );

  readonly activeSessionCount = computed<number>(() =>
    this.users().filter((user) => hasActiveSession(user)).length
  );

  readonly vacationCountYear = computed<number>(() => {
    const yearPrefix = `${new Date().getFullYear()}-`;
    return this.vacations().filter((item) => item.fecha.startsWith(yearPrefix)).length;
  });

  readonly userCountByYearMap = computed<Map<number, number>>(() => {
    const yearPrefix = `${new Date().getFullYear()}-`;
    const dateSetByUser = new Map<number, Set<string>>();

    for (const item of this.vacations()) {
      if (!item.fecha.startsWith(yearPrefix)) {
        continue;
      }
      let set = dateSetByUser.get(item.usuarioId);
      if (!set) {
        set = new Set<string>();
        dateSetByUser.set(item.usuarioId, set);
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
    this.users.set([]);
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
      if (completed === 2) {
        this.loading.set(false);
      }
    };

    this.api.getUsers(token).subscribe({
      next: (value) => {
        const parsedUsers = extractArray(value, ['usuarios', 'users', 'data'])
          .map((item) => normalizeUser(item))
          .filter((user): user is AdminUser => user !== null);

        const previousSelected = this.selectedUserIds();
        this.users.set(parsedUsers);

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

    this.api.getVacations(token).subscribe({
      next: (value) => {
        const parsedVacations = extractArray(value, ['vacaciones', 'holidays', 'data'])
          .map((item) => normalizeVacation(item))
          .filter((item): item is VacationDay => item !== null);
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

  sendBulkInvitations(onSuccess?: () => void): void {
    this.saving.set(true);
    this.api.sendBulkInvitations(this.auth.token()).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.showNotice('Se han enviado las invitaciones pendientes.');
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
        this.notifications.showNotice(`Invitación reenviada a ${user.email}.`);
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.notifications.showError(
          extractErrorMessage(error, 'No se pudo reenviar la invitación.')
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
