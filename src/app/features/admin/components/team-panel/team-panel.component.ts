import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminUser,
  getUserDisplayName,
  getUserInitials,
  getVacationTypeLabel,
  isUserPending,
} from '../../../../core/models/user.model';
import { UserColorPalette, getUserColor } from '../../../../core/models/vacation.model';

@Component({
  selector: 'app-team-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './team-panel.component.html',
  styleUrl: './team-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPanelComponent {
  readonly users = input.required<AdminUser[]>();
  readonly pendingCount = input.required<number>();
  readonly userYearCounts = input.required<Map<number, number>>();

  readonly createClick = output<void>();
  readonly bulkInviteClick = output<void>();
  readonly editUser = output<AdminUser>();
  readonly addVacations = output<AdminUser>();
  readonly resendInvite = output<AdminUser>();
  readonly closeSession = output<AdminUser>();

  protected readonly searchTerm = signal<string>('');

  protected readonly filteredUsers = computed<AdminUser[]>(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const all = this.users();
    if (!query) {
      return all;
    }
    return all.filter((u) => {
      const fullName = getUserDisplayName(u).toLowerCase();
      return (
        fullName.includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.cargo.toLowerCase().includes(query)
      );
    });
  });

  protected isPending(user: AdminUser): boolean {
    return isUserPending(user);
  }

  protected displayName(user: AdminUser): string {
    return getUserDisplayName(user);
  }

  protected initials(user: AdminUser): string {
    return getUserInitials(user);
  }

  protected userColor(user: AdminUser): UserColorPalette {
    return getUserColor(user.id, getUserDisplayName(user));
  }

  protected yearCount(userId: number): number {
    return this.userYearCounts().get(userId) ?? 0;
  }

  protected vacationTypeLabel(value: string): string {
    return getVacationTypeLabel(value);
  }

  protected triggerAction(detailsEl: HTMLDetailsElement, callback: () => void): void {
    detailsEl.open = false;
    callback();
  }
}
