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
  UserFormPayload,
  VACATION_TYPE_OPTIONS,
  createEmptyUserForm,
} from '../../../../core/models/user.model';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './user-form-modal.component.html',
  styleUrl: './user-form-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormModalComponent implements OnInit {
  readonly mode = input.required<'create' | 'edit'>();
  readonly initialUser = input<AdminUser | null>(null);
  readonly teams = input<AdminTeam[]>([]);
  readonly saving = input<boolean>(false);

  readonly save = output<UserFormPayload>();
  readonly createTeamQuick = output<{ nombre: string; autoSelectForUser: boolean }>();
  readonly cancel = output<void>();

  protected readonly form = signal<UserFormPayload>(createEmptyUserForm());
  protected readonly vacationTypeOptions = VACATION_TYPE_OPTIONS;
  protected readonly newTeamName = signal<string>('');
  protected readonly showQuickTeamInput = signal<boolean>(false);
  private readonly pendingAutoSelectTeamName = signal<string>('');

  protected readonly isVacationTypeValid = computed<boolean>(() =>
    VACATION_TYPE_OPTIONS.some((option) => option.value === this.form().tipo_vacaciones)
  );

  constructor() {
    effect(() => {
      const pendingName = this.pendingAutoSelectTeamName().trim().toLowerCase();
      if (!pendingName) {
        return;
      }
      const matched = this.teams().find((t) => t.nombre.trim().toLowerCase() === pendingName);
      if (matched) {
        this.pendingAutoSelectTeamName.set('');
        if (!this.form().equipoIds.includes(matched.id)) {
          this.form.update((current) => ({
            ...current,
            equipoIds: [...current.equipoIds, matched.id],
          }));
        }
      }
    });
  }

  ngOnInit(): void {
    const user = this.initialUser();
    if (user) {
      this.form.set({
        nombre: user.nombre,
        apellidos: user.apellidos,
        cargo: user.cargo,
        email: user.email,
        tipo_vacaciones: user.tipo_vacaciones,
        equipoIds: [...(user.equipoIds ?? [])],
      });
    } else {
      this.form.set(createEmptyUserForm());
    }
  }

  protected updateField<K extends 'nombre' | 'apellidos' | 'cargo' | 'email' | 'tipo_vacaciones'>(
    key: K,
    value: string
  ): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  protected isTeamSelected(teamId: number): boolean {
    return this.form().equipoIds.includes(teamId);
  }

  protected toggleTeam(teamId: number): void {
    this.form.update((current) => {
      const exists = current.equipoIds.includes(teamId);
      const nextIds = exists
        ? current.equipoIds.filter((id) => id !== teamId)
        : [...current.equipoIds, teamId];
      return {
        ...current,
        equipoIds: nextIds,
      };
    });
  }

  protected submitQuickTeam(): void {
    const clean = this.newTeamName().trim();
    if (!clean || this.saving()) {
      return;
    }
    this.pendingAutoSelectTeamName.set(clean);
    this.createTeamQuick.emit({ nombre: clean, autoSelectForUser: true });
    this.newTeamName.set('');
    this.showQuickTeamInput.set(false);
  }

  protected submitForm(): void {
    if (this.saving() || !this.isVacationTypeValid()) {
      return;
    }
    this.save.emit(this.form());
  }
}
