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
  isUserPending,
} from '../../../../core/models/user.model';

export interface UserSelectionChange {
  userId: number;
  checked: boolean;
}

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
  readonly selectedUserIds = input.required<number[]>();
  readonly userYearCounts = input.required<Map<number, number>>();

  readonly createClick = output<void>();
  readonly bulkInviteClick = output<void>();
  readonly toggleSelection = output<UserSelectionChange>();
  readonly selectAll = output<void>();
  readonly clearSelection = output<void>();
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

  protected isSelected(userId: number): boolean {
    return this.selectedUserIds().includes(userId);
  }

  protected isPending(user: AdminUser): boolean {
    return isUserPending(user);
  }

  protected displayName(user: AdminUser): string {
    return getUserDisplayName(user);
  }

  protected initials(user: AdminUser): string {
    return getUserInitials(user);
  }

  protected yearCount(userId: number): number {
    return this.userYearCounts().get(userId) ?? 0;
  }

  protected onCheckboxChange(userId: number, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.toggleSelection.emit({ userId, checked: Boolean(target?.checked) });
  }

  protected triggerAction(detailsEl: HTMLDetailsElement, callback: () => void): void {
    detailsEl.open = false;
    callback();
  }
}
