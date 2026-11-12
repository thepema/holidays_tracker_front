import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminTeam,
  AdminUser,
  getUserDisplayName,
  getUserInitials,
} from '../../../../core/models/user.model';
import { UserColorPalette, getUserColor } from '../../../../core/models/vacation.model';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-teams-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './teams-modal.component.html',
  styleUrl: './teams-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsModalComponent implements OnInit {
  readonly teams = input.required<AdminTeam[]>();
  readonly users = input.required<AdminUser[]>();
  readonly saving = input<boolean>(false);

  readonly createTeam = output<{ nombre: string; usuarioIds: number[] }>();
  readonly updateTeam = output<{ equipoId: number; nombre: string; usuarioIds: number[] }>();
  readonly deleteTeam = output<AdminTeam>();
  readonly cancel = output<void>();

  /** 'create' o ID numérico del equipo seleccionado para editar */
  protected readonly activeTeamId = signal<number | 'create'>('create');
  protected readonly teamName = signal<string>('');
  protected readonly selectedUserIds = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly userSearch = signal<string>('');

  private initialized = false;

  constructor() {
    effect(() => {
      const list = this.teams();
      const active = this.activeTeamId();
      if (!this.initialized && list.length > 0) {
        this.initialized = true;
        this.selectTeamForEdit(list[0]);
        return;
      }
      if (typeof active === 'number') {
        const current = list.find((t) => t.id === active);
        if (!current) {
          if (list.length > 0) {
            this.selectTeamForEdit(list[0]);
          } else {
            this.startCreateTeam();
          }
        }
      }
    });
  }

  ngOnInit(): void {
    const list = this.teams();
    if (list.length > 0) {
      this.initialized = true;
      this.selectTeamForEdit(list[0]);
    } else {
      this.startCreateTeam();
    }
  }

  protected readonly activeTeam = computed<AdminTeam | null>(() => {
    const active = this.activeTeamId();
    if (active === 'create') {
      return null;
    }
    return this.teams().find((t) => t.id === active) ?? null;
  });

  protected readonly filteredUsers = computed<AdminUser[]>(() => {
    const q = this.userSearch().trim().toLowerCase();
    const all = this.users();
    if (!q) {
      return all;
    }
    return all.filter((u) => {
      const fullName = getUserDisplayName(u).toLowerCase();
      return (
        fullName.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.cargo.toLowerCase().includes(q)
      );
    });
  });

  protected startCreateTeam(): void {
    this.activeTeamId.set('create');
    this.teamName.set('');
    this.selectedUserIds.set(new Set<number>());
  }

  protected selectTeamForEdit(team: AdminTeam): void {
    this.activeTeamId.set(team.id);
    this.teamName.set(team.nombre);
    this.selectedUserIds.set(new Set<number>(team.usuarioIds));
  }

  protected isUserSelected(userId: number): boolean {
    return this.selectedUserIds().has(userId);
  }

  protected toggleUser(userId: number): void {
    const next = new Set<number>(this.selectedUserIds());
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    this.selectedUserIds.set(next);
  }

  protected selectAllFilteredUsers(): void {
    const next = new Set<number>(this.selectedUserIds());
    for (const u of this.filteredUsers()) {
      next.add(u.id);
    }
    this.selectedUserIds.set(next);
  }

  protected clearSelectedUsers(): void {
    this.selectedUserIds.set(new Set<number>());
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

  protected submitTeam(): void {
    const cleanName = this.teamName().trim();
    if (!cleanName || this.saving()) {
      return;
    }
    const usuarioIds = [...this.selectedUserIds()];
    const active = this.activeTeamId();

    if (active === 'create') {
      this.createTeam.emit({ nombre: cleanName, usuarioIds });
      this.teamName.set('');
      this.selectedUserIds.set(new Set<number>());
    } else {
      this.updateTeam.emit({
        equipoId: active,
        nombre: cleanName,
        usuarioIds,
      });
    }
  }

  protected onDeleteTeam(team: AdminTeam, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.saving()) {
      return;
    }
    if (
      confirm(
        `¿Seguro que quieres eliminar el equipo "${team.nombre}"? Se desvincularán sus usuarios asignados.`
      )
    ) {
      this.deleteTeam.emit(team);
    }
  }
}
