import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
   inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService, SessionActivationResponse } from '../../../../core/services/api.service';
import { UserSessionService } from '../../../../core/services/user-session.service';
import { extractErrorMessage } from '../../../../core/utils/http-helpers';

export type LandingMode = 'solicitar' | 'recuperar';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  private readonly api = inject(ApiService);
  private readonly userSession = inject(UserSessionService);

  readonly sessionRecovered = output<void>();

  readonly activeMode = signal<LandingMode>('solicitar');

  // Formulario de Solicitud de Sesión (Nombre + Correo)
  readonly requestNombre = signal<string>('');
  readonly requestEmail = signal<string>('');
  readonly requestLoading = signal<boolean>(false);
  readonly requestError = signal<string>('');
  readonly requestSuccess = signal<boolean>(false);
  readonly requestSuccessMessage = signal<string>('');

  // Formulario de Recuperación de Sesión (Token de recuperación)
  readonly recoveryToken = signal<string>('');
  readonly recoveryLoading = signal<boolean>(false);
  readonly recoveryError = signal<string>('');

  setMode(mode: LandingMode): void {
    this.activeMode.set(mode);
    this.requestError.set('');
    this.recoveryError.set('');
  }

  submitSessionRequest(): void {
    const nombre = this.requestNombre().trim();
    const email = this.requestEmail().trim();

    if (!nombre || !email) {
      this.requestError.set('Por favor, introduce tu nombre y tu correo electrónico.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.requestError.set('Introduce una dirección de correo electrónico con formato válido.');
      return;
    }

    this.requestLoading.set(true);
    this.requestError.set('');
    this.requestSuccess.set(false);

    this.api.requestSessionByNameAndEmail(nombre, email).subscribe({
      next: (res) => {
        this.requestLoading.set(false);
        this.requestSuccess.set(true);
        this.requestSuccessMessage.set(
          res?.mensaje ||
            'Tu solicitud de sesión ha sido registrada como solicitada. El administrador te enviará tu enlace de acceso.'
        );
      },
      error: (err: unknown) => {
        this.requestLoading.set(false);
        this.requestError.set(
          extractErrorMessage(
            err,
            'No se ha encontrado ningún usuario con ese nombre y correo en la base de datos.'
          )
        );
      },
    });
  }

  resetRequestForm(): void {
    this.requestSuccess.set(false);
    this.requestError.set('');
    this.requestNombre.set('');
    this.requestEmail.set('');
  }

  submitRecoveryToken(): void {
    const token = this.recoveryToken().trim();
    if (!token) {
      this.recoveryError.set('Introduce tu token de recuperación para restaurar la sesión.');
      return;
    }

    this.recoveryLoading.set(true);
    this.recoveryError.set('');

    this.api.recoverSessionWithToken(token).subscribe({
      next: (response: SessionActivationResponse) => {
        this.recoveryLoading.set(false);
        this.userSession.saveSession(response.usuario, response.token);
        this.sessionRecovered.emit();
      },
      error: (err: unknown) => {
        this.recoveryLoading.set(false);
        this.recoveryError.set(
          extractErrorMessage(
            err,
            'El token de recuperación no es válido o la sesión ha sido revocada.'
          )
        );
      },
    });
  }
}
