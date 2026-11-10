import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  AdminUser,
  getUserDisplayName,
  getUserInitials,
  getVacationTypeLabel,
} from '../../../../core/models/user.model';
import { StatCardComponent } from '../../../../shared/components/stat-card/stat-card.component';

@Component({
  selector: 'app-session-requests',
  standalone: true,
  imports: [StatCardComponent],
  templateUrl: './session-requests.component.html',
  styleUrl: './session-requests.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionRequestsComponent {
  readonly pendingUsers = input.required<AdminUser[]>();
  readonly requestedUsers = input<AdminUser[]>([]);
  readonly resendInvite = output<AdminUser>();
  readonly bulkInviteClick = output<void>();
  readonly sendAllRequestedClick = output<void>();

  protected displayName(user: AdminUser): string {
    return getUserDisplayName(user);
  }

  protected initials(user: AdminUser): string {
    return getUserInitials(user);
  }

  protected vacationTypeLabel(value: string): string {
    return getVacationTypeLabel(value);
  }
}
