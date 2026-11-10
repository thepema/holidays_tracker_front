import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { AdminUser, UserFormPayload } from '../../../../core/models/user.model';
import { AdminStateService } from '../../../../core/services/admin-state.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AlertBannerComponent } from '../../../../shared/components/alert-banner/alert-banner.component';
import {
  AdminHeaderComponent,
  AdminViewTab,
} from '../../components/admin-header/admin-header.component';
import { ConfirmBulkModalComponent } from '../../components/confirm-bulk-modal/confirm-bulk-modal.component';
import { SessionRequestsComponent } from '../../components/session-requests/session-requests.component';
import {
  TeamPanelComponent,
  UserSelectionChange,
} from '../../components/team-panel/team-panel.component';
import { UserFormModalComponent } from '../../components/user-form-modal/user-form-modal.component';
import { VacationCalendarComponent } from '../../components/vacation-calendar/vacation-calendar.component';
import { VacationModalComponent } from '../../components/vacation-modal/vacation-modal.component';

type ActiveModal = 'create' | 'edit' | 'vacations' | 'confirm-bulk' | '';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    AdminHeaderComponent,
    AlertBannerComponent,
    VacationCalendarComponent,
    TeamPanelComponent,
    SessionRequestsComponent,
    UserFormModalComponent,
    VacationModalComponent,
    ConfirmBulkModalComponent,
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

  protected openVacationsModal(user: AdminUser): void {
    this.selectedUserForModal.set(user);
    this.activeModal.set('vacations');
  }

  protected openConfirmBulkModal(): void {
    this.activeModal.set('confirm-bulk');
  }

  protected closeModal(): void {
    this.activeModal.set('');
    this.selectedUserForModal.set(null);
  }

  protected handleUserSelection(change: UserSelectionChange): void {
    this.state.toggleUserSelection(change.userId, change.checked);
  }

  protected handleSaveUser(payload: UserFormPayload): void {
    const editingId =
      this.activeModal() === 'edit' ? (this.selectedUserForModal()?.id ?? null) : null;
    this.state.saveUser(payload, editingId, () => this.closeModal());
  }

  protected handleSaveVacations(rawDates: string): void {
    const user = this.selectedUserForModal();
    if (!user) {
      return;
    }
    this.state.addVacations(user.id, rawDates, () => this.closeModal());
  }

  protected handleConfirmBulkInvite(): void {
    this.state.sendBulkInvitations(() => this.closeModal());
  }

  protected handleSendAllRequested(): void {
    const count = this.state.requestedUsers().length;
    if (confirm(`¿Quieres enviar invitación individual a los ${count} usuarios con reseteo solicitado?`)) {
      this.state.sendRequestedInvitations();
    }
  }
}
