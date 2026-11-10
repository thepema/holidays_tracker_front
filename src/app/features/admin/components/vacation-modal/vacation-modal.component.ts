import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminUser, getUserDisplayName } from '../../../../core/models/user.model';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-vacation-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './vacation-modal.component.html',
  styleUrl: './vacation-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VacationModalComponent {
  readonly user = input.required<AdminUser>();
  readonly saving = input<boolean>(false);

  readonly saveDates = output<string>();
  readonly cancel = output<void>();

  protected readonly vacationDates = signal<string>('');
  protected readonly pickerDate = signal<string>('');

  protected readonly userFullName = computed<string>(() => getUserDisplayName(this.user()));

  protected readonly parsedDatesCount = computed<number>(() => {
    const raw = this.vacationDates().trim();
    if (!raw) {
      return 0;
    }
    return new Set(
      raw
        .split(/[\s,;]+/)
        .map((d) => d.trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    ).size;
  });

  protected appendPickerDate(): void {
    const selected = this.pickerDate().trim();
    if (!selected) {
      return;
    }
    const current = this.vacationDates().trim();
    const updated = current ? `${current}, ${selected}` : selected;
    this.vacationDates.set(updated);
    this.pickerDate.set('');
  }

  protected submitVacations(): void {
    if (this.saving()) {
      return;
    }
    this.saveDates.emit(this.vacationDates());
  }
}
