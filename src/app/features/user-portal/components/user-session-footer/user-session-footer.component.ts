import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-user-session-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-session-footer.component.html',
  styleUrl: './user-session-footer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSessionFooterComponent {}
