import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'app-modal-shell',
  standalone: true,
  templateUrl: './modal-shell.component.html',
  styleUrl: './modal-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalShellComponent {
  readonly eyebrow = input<string>('');
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly roleType = input<'dialog' | 'alertdialog'>('dialog');
  readonly closeModal = output<void>();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeModal.emit();
  }
}
