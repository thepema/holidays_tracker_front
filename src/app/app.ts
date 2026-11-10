import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AdminUser } from './api.service';

interface VacationDay {
  usuarioId: number;
  fecha: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected token = '';
  protected password = '';
  protected loginError = '';
  protected errorMessage = '';
  protected notice = '';
  protected loading = false;
  protected users: AdminUser[] = [];
  protected vacations: VacationDay[] = [];
  protected selectedUserIds: number[] = [];
  protected activeView: 'dashboard' | 'requests' = 'dashboard';
  protected month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  protected modal: 'create' | 'edit' | 'vacations' | '' = '';
  protected confirmBulk = false;
  protected editingUserId: number | null = null;
  protected vacationUserId: number | null = null;
  protected vacationDates = '';
  protected saving = false;
  protected form: Omit<AdminUser, 'id'> = this.emptyForm();
  protected readonly weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {}

  protected get calendarCells(): (Date | null)[] {
    const first = new Date(this.month.getFullYear(), this.month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 0).getDate();
    return [...Array<Date | null>(offset).fill(null), ...Array.from({ length: count }, (_, day) => new Date(this.month.getFullYear(), this.month.getMonth(), day + 1))];
  }

  protected get monthName(): string {
    return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(this.month);
  }

  protected get vacationCountYear(): number {
    const year = new Date().getFullYear();
    return this.vacations.filter((item) => item.fecha.startsWith(`${year}-`)).length;
  }

  protected get pendingUsers(): AdminUser[] {
    return this.users.filter((user) => this.isPending(user));
  }

  protected get requestUsers(): AdminUser[] {
    return this.users.filter((user) => Boolean(user['solicitudPendiente'] ?? user['solicitud_pendiente'] ?? user['sessionRequested'] ?? user['session_requested']));
  }

  protected get activeSessionCount(): number {
    return this.users.filter((user) => this.hasSession(user)).length;
  }

  protected login(): void {
    this.loginError = '';
    this.loading = true;
    this.api.login(this.password).subscribe({
      next: (result) => {
        const body = this.asRecord(result);
        this.token = String(body['token'] ?? '');
        if (!this.token) {
          this.loginError = 'La respuesta de la API no contiene un token válido.';
          this.loading = false;
          return;
        }
        this.password = '';
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.loginError = this.errorText(error, 'No se pudo iniciar sesión. Comprueba la contraseña e inténtalo de nuevo.');
        this.loading = false;
      },
    });
  }

  protected logout(): void {
    this.token = '';
    this.users = [];
    this.vacations = [];
    this.selectedUserIds = [];
    this.activeView = 'dashboard';
    this.notice = '';
    this.errorMessage = '';
  }

  protected loadDashboard(): void {
    this.loading = true;
    this.errorMessage = '';
    let completed = 0;
    const finish = (): void => { completed += 1; if (completed === 2) this.loading = false; };
    this.api.getUsers(this.token).subscribe({
      next: (value) => {
        this.users = this.extractArray(value, ['usuarios', 'users', 'data']).map((item) => this.normalizeUser(item)).filter((user): user is AdminUser => user !== null);
        this.selectedUserIds = this.users.map((user) => user.id);
        finish();
      },
      error: (error: unknown) => {
        this.errorMessage = this.errorText(error, 'No se pudieron cargar los usuarios.');
        finish();
      },
    });
    this.api.getVacations(this.token).subscribe({
      next: (value) => {
        this.vacations = this.extractArray(value, ['vacaciones', 'holidays', 'data']).map((item) => this.normalizeVacation(item)).filter((item): item is VacationDay => item !== null);
        finish();
      },
      error: (error: unknown) => {
        this.errorMessage = this.errorText(error, 'No se pudieron cargar las vacaciones.');
        finish();
      },
    });
  }

  protected countForDay(date: Date): number {
    const dateString = this.dateKey(date);
    return new Set(this.vacations.filter((vacation) => vacation.fecha === dateString && this.selectedUserIds.includes(vacation.usuarioId)).map((vacation) => vacation.usuarioId)).size;
  }

  protected changeMonth(offset: number): void {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + offset, 1);
  }

  protected toggleUser(id: number, checked: boolean): void {
    this.selectedUserIds = checked ? [...new Set([...this.selectedUserIds, id])] : this.selectedUserIds.filter((selected) => selected !== id);
  }

  protected isSelected(id: number): boolean {
    return this.selectedUserIds.includes(id);
  }

  protected openCreate(): void {
    this.form = this.emptyForm();
    this.editingUserId = null;
    this.modal = 'create';
  }

  protected openEdit(user: AdminUser): void {
    this.form = { nombre: user.nombre, apellidos: user.apellidos, cargo: user.cargo, email: user.email, tipo_vacaciones: user.tipo_vacaciones };
    this.editingUserId = user.id;
    this.modal = 'edit';
  }

  protected saveUser(): void {
    this.saving = true;
    const request = this.modal === 'edit' && this.editingUserId !== null
      ? this.api.updateUser(this.editingUserId, this.form, this.token)
      : this.api.createUser(this.form, this.token);
    request.subscribe({
      next: () => {
        this.modal = '';
        this.notice = this.editingUserId === null ? 'Usuario creado correctamente.' : 'Usuario actualizado correctamente.';
        this.loadDashboard();
        this.saving = false;
      },
      error: (error: unknown) => { this.errorMessage = this.errorText(error, 'No se pudo guardar el usuario.'); this.saving = false; },
    });
  }

  protected openVacations(user: AdminUser): void {
    this.vacationUserId = user.id;
    this.vacationDates = '';
    this.modal = 'vacations';
  }

  protected saveVacations(): void {
    if (this.vacationUserId === null) return;
    const dates = [...new Set(this.vacationDates.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
    if (!dates.length || dates.length > 366 || dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`)))) {
      this.errorMessage = 'Introduce entre 1 y 366 fechas válidas con formato YYYY-MM-DD.';
      return;
    }
    this.saving = true;
    this.api.addVacations(this.vacationUserId, dates, this.token).subscribe({
      next: () => { this.modal = ''; this.notice = 'Días de vacaciones registrados.'; this.loadDashboard(); this.saving = false; },
      error: (error: unknown) => { this.errorMessage = this.errorText(error, 'No se pudieron registrar las vacaciones.'); this.saving = false; },
    });
  }

  protected sendInvitations(): void {
    this.confirmBulk = false;
    this.saving = true;
    this.api.sendBulkInvitations(this.token).subscribe({
      next: () => { this.notice = 'Se han enviado las invitaciones pendientes.'; this.loadDashboard(); this.saving = false; },
      error: (error: unknown) => { this.errorMessage = this.errorText(error, 'No se pudieron enviar las invitaciones.'); this.saving = false; },
    });
  }

  protected resendInvitation(user: AdminUser): void {
    this.api.inviteUser(user.id, this.token).subscribe({
      next: () => { this.notice = `Invitación reenviada a ${user.email}.`; this.loadDashboard(); },
      error: (error: unknown) => { this.errorMessage = this.errorText(error, 'No se pudo reenviar la invitación.'); },
    });
  }

  protected closeSession(user: AdminUser): void {
    if (!confirm(`¿Quieres cerrar la sesión de ${user.nombre} ${user.apellidos}?`)) return;
    this.api.closeSession(user.id, this.token).subscribe({
      next: () => { this.notice = `Sesión cerrada para ${user.nombre} ${user.apellidos}.`; this.loadDashboard(); },
      error: (error: unknown) => { this.errorMessage = this.errorText(error, 'No se pudo cerrar la sesión.'); },
    });
  }

  protected isPending(user: AdminUser): boolean {
    const value = user['sesionActiva'] ?? user['sesion_activa'] ?? user['hasSession'] ?? user['has_session'] ?? user['sessionActive'] ?? user['session_active'];
    return value === false || value === 0 || value === 'false' || value === null;
  }

  protected hasSession(user: AdminUser): boolean {
    return !this.isPending(user);
  }

  protected userYearCount(userId: number): number {
    const year = `${new Date().getFullYear()}-`;
    return new Set(this.vacations.filter((item) => item.usuarioId === userId && item.fecha.startsWith(year)).map((item) => item.fecha)).size;
  }

  protected trackUser(_index: number, user: AdminUser): number { return user.id; }
  protected closeModal(): void { this.modal = ''; this.errorMessage = ''; }
  protected displayName(user: AdminUser): string { return `${user.nombre} ${user.apellidos}`.trim(); }

  private emptyForm(): Omit<AdminUser, 'id'> {
    return { nombre: '', apellidos: '', cargo: '', email: '', tipo_vacaciones: '' };
  }

  private normalizeUser(value: unknown): AdminUser | null {
    const item = this.asRecord(value);
    const id = Number(item['id'] ?? item['usuarioId'] ?? item['usuario_id']);
    if (!Number.isFinite(id) || id < 1) return null;
    return { ...item, id, nombre: String(item['nombre'] ?? ''), apellidos: String(item['apellidos'] ?? ''), cargo: String(item['cargo'] ?? ''), email: String(item['email'] ?? ''), tipo_vacaciones: String(item['tipo_vacaciones'] ?? '') } as AdminUser;
  }

  private normalizeVacation(value: unknown): VacationDay | null {
    const item = this.asRecord(value);
    const usuarioId = Number(item['usuarioId'] ?? item['usuario_id'] ?? item['idUsuario']);
    const rawDate = item['fecha'] ?? item['date'];
    const fecha = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
    return Number.isFinite(usuarioId) && fecha ? { usuarioId, fecha } : null;
  }

  private extractArray(value: unknown, keys: string[]): unknown[] {
    if (Array.isArray(value)) return value;
    const record = this.asRecord(value);
    for (const key of keys) if (Array.isArray(record[key])) return record[key] as unknown[];
    return [];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private errorText(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const body = (error as { error?: unknown }).error;
      if (typeof body === 'object' && body !== null && 'error' in body) return String((body as { error: unknown }).error);
      if (typeof body === 'string' && body) return body;
    }
    return fallback;
  }
}
