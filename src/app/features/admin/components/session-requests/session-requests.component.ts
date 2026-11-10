import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  AdminUser,
  getUserDisplayName,
  getUserInitials,
} from '../../../../core/models/user.model';

@Component({
  selector: 'app-session-requests',
  standalone: true,
  templateUrl: './session-requests.component.html',
  styleUrl: './session-requests.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionRequestsComponent {
  readonly requestUsers = input.required<AdminUser[]>();
  readonly resendInvite = output<AdminUser>();

  protected displayName(user: AdminUser): string {
    return getUserDisplayName(user);
  }

  protected initials(user: AdminUser): string {
    return getUserInitials(user);
  }
}
