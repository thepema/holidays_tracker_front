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
  AdminOffice,
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
  readonly offices = input<AdminOffice[]>([]);
  readonly saving = input<boolean>(false);

  readonly save = output<UserFormPayload>();
  readonly createTeamQuick = output<{ nombre: string; autoSelectForUser: boolean }>();
  readonly createOfficeQuick = output<{ nombre: string; autoSelectForUser: boolean }>();
  readonly cancel = output<void>();

  protected readonly form = signal<UserFormPayload>(createEmptyUserForm());
  protected readonly vacationTypeOptions = VACATION_TYPE_OPTIONS;
  protected readonly newTeamName = signal<string>('');
  protected readonly showQuickTeamInput = signal<boolean>(false);
  protected readonly newOfficeName = signal<string>('');
  protected readonly showQuickOfficeInput = signal<boolean>(false);
  private readonly pendingAutoSelectTeamName = signal<string>('');
  private readonly pendingAutoSelectOfficeName = signal<string>('');

  protected readonly isVacationTypeValid = computed<boolean>(() =>
    VACATION_TYPE_OPTIONS.some((option) => option.value === this.form().tipo_vacaciones)
  );

  protected readonly isFormValid = computed<boolean>(() => {
    const f = this.form();
    return (
      Boolean(f.codigo.trim()) &&
      Boolean(f.nombre.trim()) &&
      Boolean(f.apellidos.trim()) &&
      Boolean(f.cargo.trim()) &&
      Boolean(f.email.trim()) &&
      this.isVacationTypeValid()
    );
  });

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

    effect(() => {
      const pendingOffice = this.pendingAutoSelectOfficeName().trim().toLowerCase();
      if (!pendingOffice) {
        return;
      }
      const matched = this.offices().find(
        (o) => o.nombre.trim().toLowerCase() === pendingOffice
      );
      if (matched) {
        this.pendingAutoSelectOfficeName.set('');
        this.form.update((current) => ({
          ...current,
          oficinaId: matched.id,
        }));
      }
    });
  }

  ngOnInit(): void {
    const user = this.initialUser();
    if (user) {
      this.form.set({
        codigo: user.codigo ?? '',
        nombre: user.nombre,
        apellidos: user.apellidos,
        cargo: user.cargo,
        email: user.email,
        tipo_vacaciones: user.tipo_vacaciones,
        oficinaId: user.oficinaId ?? null,
        equipoIds: [...(user.equipoIds ?? [])],
      });
    } else {
      this.form.set(createEmptyUserForm());
    }
  }

  protected updateField<
    K extends 'codigo' | 'nombre' | 'apellidos' | 'cargo' | 'email' | 'tipo_vacaciones',
  >(key: K, value: string): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  protected updateOfficeId(value: number | string | null): void {
    if (value === null || value === '' || value === 'null') {
      this.form.update((current) => ({ ...current, oficinaId: null }));
      return;
    }
    const parsed = Number(value);
    this.form.update((current) => ({
      ...current,
      oficinaId: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
    }));
  }

  protected submitQuickOffice(): void {
    const clean = this.newOfficeName().trim();
    if (!clean || this.saving()) {
      return;
    }
    this.pendingAutoSelectOfficeName.set(clean);
    this.createOfficeQuick.emit({ nombre: clean, autoSelectForUser: true });
    this.newOfficeName.set('');
    this.showQuickOfficeInput.set(false);
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
    if (this.saving() || !this.isFormValid()) {
      return;
    }
    this.save.emit(this.form());
  }
}
