import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-alert-banner',
  standalone: true,
  templateUrl: './alert-banner.component.html',
  styleUrl: './alert-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertBannerComponent {
  readonly notice = input<string>('');
  readonly errorMessage = input<string>('');
  readonly dismissNotice = output<void>();
  readonly dismissError = output<void>();
}
