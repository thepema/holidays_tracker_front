import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type AdminViewTab = 'dashboard' | 'requests';

@Component({
  selector: 'app-admin-header',
  standalone: true,
  templateUrl: './admin-header.component.html',
  styleUrl: './admin-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHeaderComponent {
  readonly activeView = input.required<AdminViewTab>();
  readonly requestCount = input<number>(0);
  readonly loading = input<boolean>(false);

  readonly viewChange = output<AdminViewTab>();
  readonly refreshData = output<void>();
  readonly logoutClick = output<void>();
}
