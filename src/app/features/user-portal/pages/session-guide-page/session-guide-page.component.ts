import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-session-guide-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './session-guide-page.component.html',
  styleUrl: './session-guide-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionGuidePageComponent {}
