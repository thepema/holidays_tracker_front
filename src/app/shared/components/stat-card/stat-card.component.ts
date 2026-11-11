import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatAccent = 'emerald' | 'indigo' | 'amber' | 'slate';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly note = input<string>('');
  readonly icon = input<string>('◆');
  readonly accent = input<StatAccent>('emerald');
}
