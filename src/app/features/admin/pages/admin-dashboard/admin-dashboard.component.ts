import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  AdminOffice,
  AdminTeam,
  AdminUser,
  OfficeHoliday,
  UserFormPayload,
  getUserDisplayName,
} from '../../../../core/models/user.model';
import { VacationDay } from '../../../../core/models/vacation.model';
import { AdminStateService } from '../../../../core/services/admin-state.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AlertBannerComponent } from '../../../../shared/components/alert-banner/alert-banner.component';
import {
  AdminHeaderComponent,
  AdminViewTab,
} from '../../components/admin-header/admin-header.component';
import { ConfirmBulkModalComponent } from '../../components/confirm-bulk-modal/confirm-bulk-modal.component';
import { ExportExcelModalComponent } from '../../components/export-excel-modal/export-excel-modal.component';
import { OfficesModalComponent } from '../../components/offices-modal/offices-modal.component';
import { SessionRequestsComponent } from '../../components/session-requests/session-requests.component';
import { TeamPanelComponent } from '../../components/team-panel/team-panel.component';
import { TeamsModalComponent } from '../../components/teams-modal/teams-modal.component';
import { UserFormModalComponent } from '../../components/user-form-modal/user-form-modal.component';
import { VacationCalendarComponent } from '../../components/vacation-calendar/vacation-calendar.component';
import { VacationModalComponent } from '../../components/vacation-modal/vacation-modal.component';

type ActiveModal =
  | 'create'
  | 'edit'
  | 'teams'
  | 'offices'
  | 'vacations'
  | 'confirm-bulk'
  | 'export-excel'
  | '';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    AdminHeaderComponent,
    AlertBannerComponent,
    VacationCalendarComponent,
    TeamPanelComponent,
    TeamsModalComponent,
    OfficesModalComponent,
    SessionRequestsComponent,
    UserFormModalComponent,
    VacationModalComponent,
    ConfirmBulkModalComponent,
    ExportExcelModalComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  protected readonly state = inject(AdminStateService);
  protected readonly notifications = inject(NotificationService);

  readonly logoutRequested = output<void>();

  protected readonly activeView = signal<AdminViewTab>('dashboard');
  protected readonly activeModal = signal<ActiveModal>('');
  protected readonly selectedUserForModal = signal<AdminUser | null>(null);

  protected readonly selectedUserVacations = computed<VacationDay[]>(() => {
    const user = this.selectedUserForModal();
    if (!user) {
      return [];
    }
    const targetName = getUserDisplayName(user).toLowerCase();
    return this.state.vacations().filter((vac) => {
      if (vac.usuarioId === user.id) {
        return true;
      }
      const vacName = `${vac.nombre ?? ''} ${vac.apellidos ?? ''}`.trim().toLowerCase();
      return Boolean(targetName && vacName && vacName === targetName);
    });
  });

  protected readonly selectedUserHolidays = computed<OfficeHoliday[]>(() => {
    const user = this.selectedUserForModal();
    if (!user) {
      return [];
    }
    const liveUser = this.state.users().find((u) => u.id === user.id) ?? user;
    if (!liveUser.oficinaId) {
      return [];
    }
    return this.state.offices().find((o) => o.id === liveUser.oficinaId)?.festivos ?? [];
  });

  protected readonly currentDateFormatted = computed<string>(() =>
    new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  );

  ngOnInit(): void {
    this.state.loadDashboard();
  }

  protected openCreateUserModal(): void {
    this.selectedUserForModal.set(null);
    this.activeModal.set('create');
  }

  protected openEditUserModal(user: AdminUser): void {
    this.selectedUserForModal.set(user);
    this.activeModal.set('edit');
  }

  protected openTeamsModal(): void {
    this.activeModal.set('teams');
  }

  protected openOfficesModal(): void {
    this.activeModal.set('offices');
  }

  protected openVacationsModal(user: AdminUser): void {
    this.selectedUserForModal.set(user);
    this.activeModal.set('vacations');
  }

  protected openConfirmBulkModal(): void {
    this.activeModal.set('confirm-bulk');
  }

  protected openExportExcelModal(): void {
    this.activeModal.set('export-excel');
  }

  protected closeModal(): void {
    this.activeModal.set('');
    this.selectedUserForModal.set(null);
  }

  protected handleSaveUser(payload: UserFormPayload): void {
    const editingId =
      this.activeModal() === 'edit' ? (this.selectedUserForModal()?.id ?? null) : null;
    this.state.saveUser(payload, editingId, () => this.closeModal());
  }

  protected handleQuickCreateTeam(event: { nombre: string; autoSelectForUser: boolean }): void {
    const editingId =
      this.activeModal() === 'edit' ? (this.selectedUserForModal()?.id ?? null) : null;
    const initialUserIds =
      event.autoSelectForUser && editingId !== null ? [editingId] : [];
    this.state.createTeam(event.nombre, initialUserIds);
  }

  protected handleCreateTeam(payload: { nombre: string; usuarioIds: number[] }): void {
    this.state.createTeam(payload.nombre, payload.usuarioIds);
  }

  protected handleUpdateTeam(payload: {
    equipoId: number;
    nombre: string;
    usuarioIds: number[];
  }): void {
    this.state.updateTeam(payload.equipoId, {
      nombre: payload.nombre,
      usuarioIds: payload.usuarioIds,
    });
  }

  protected handleDeleteTeam(team: AdminTeam): void {
    this.state.deleteTeam(team.id);
  }

  protected handleQuickCreateOffice(event: { nombre: string; autoSelectForUser: boolean }): void {
    const editingId =
      this.activeModal() === 'edit' ? (this.selectedUserForModal()?.id ?? null) : null;
    const initialUserIds =
      event.autoSelectForUser && editingId !== null ? [editingId] : [];
    this.state.createOffice(event.nombre, initialUserIds);
  }

  protected handleCreateOffice(payload: { nombre: string; usuarioIds: number[] }): void {
    this.state.createOffice(payload.nombre, payload.usuarioIds);
  }

  protected handleUpdateOffice(payload: {
    oficinaId: number;
    nombre: string;
    usuarioIds: number[];
  }): void {
    this.state.updateOffice(payload.oficinaId, {
      nombre: payload.nombre,
      usuarioIds: payload.usuarioIds,
    });
  }

  protected handleDeleteOffice(office: AdminOffice): void {
    this.state.deleteOffice(office.id);
  }

  protected handleCreateOfficeCalendar(payload: { oficinaId: number; anio: number }): void {
    this.state.createOfficeCalendar(payload.oficinaId, payload.anio);
  }

  protected handleDeleteOfficeCalendar(payload: {
    oficinaId: number;
    calendarioId: number;
  }): void {
    this.state.deleteOfficeCalendar(payload.oficinaId, payload.calendarioId);
  }

  protected handleAddOfficeHoliday(payload: {
    oficinaId: number;
    fecha: string;
    nombre: string;
  }): void {
    this.state.addOfficeHoliday(payload.oficinaId, {
      fecha: payload.fecha,
      nombre: payload.nombre,
    });
  }

  protected handleDeleteOfficeHoliday(payload: {
    oficinaId: number;
    festivoId: number;
  }): void {
    this.state.deleteOfficeHoliday(payload.oficinaId, payload.festivoId);
  }

  protected handleSaveVacations(rawDates: string): void {
    const user = this.selectedUserForModal();
    if (!user) {
      return;
    }
    this.state.addVacations(user.id, rawDates, () => this.closeModal());
  }

  protected handleDeleteVacationFromModal(vacacionId: number): void {
    this.state.deleteVacation(vacacionId);
  }

  protected handleDeleteVacationFromCalendar(event: {
    vacacionId: number;
    fullName: string;
    fecha: string;
  }): void {
    this.state.deleteVacation(event.vacacionId);
  }

  protected handleConfirmBulkInvite(): void {
    this.state.sendBulkInvitations(() => this.closeModal());
  }

  protected handleExportExcel(period: {
    month: number;
    year: number;
    equipoId: number | null;
  }): void {
    this.state.exportVacationsToExcel(period.month, period.year, period.equipoId, () =>
      this.closeModal()
    );
  }

  protected handleSendAllRequested(): void {
    const count = this.state.requestedUsers().length;
    if (confirm(`¿Quieres enviar invitación individual a los ${count} usuarios con reseteo solicitado?`)) {
      this.state.sendRequestedInvitations();
    }
  }
}
