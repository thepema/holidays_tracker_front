import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminUser,
  UserFormPayload,
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
  readonly saving = input<boolean>(false);

  readonly save = output<UserFormPayload>();
  readonly cancel = output<void>();

  protected readonly form = signal<UserFormPayload>(createEmptyUserForm());

  ngOnInit(): void {
    const user = this.initialUser();
    if (user) {
      this.form.set({
        nombre: user.nombre,
        apellidos: user.apellidos,
        cargo: user.cargo,
        email: user.email,
        tipo_vacaciones: user.tipo_vacaciones,
      });
    } else {
      this.form.set(createEmptyUserForm());
    }
  }

  protected updateField<K extends keyof UserFormPayload>(key: K, value: string): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  protected submitForm(): void {
    if (this.saving()) {
      return;
    }
    this.save.emit(this.form());
  }
}
