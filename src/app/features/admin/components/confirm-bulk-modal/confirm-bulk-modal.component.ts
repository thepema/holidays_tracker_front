import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-confirm-bulk-modal',
  standalone: true,
  imports: [ModalShellComponent],
  templateUrl: './confirm-bulk-modal.component.html',
  styleUrl: './confirm-bulk-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmBulkModalComponent {
  readonly pendingCount = input.required<number>();
  readonly saving = input<boolean>(false);

  readonly confirmSend = output<void>();
  readonly cancel = output<void>();
}
