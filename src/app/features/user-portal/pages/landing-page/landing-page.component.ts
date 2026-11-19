import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, SessionActivationResponse } from '../../../../core/services/api.service';
import { UserSessionService } from '../../../../core/services/user-session.service';
import { extractErrorMessage } from '../../../../core/utils/http-helpers';

export type LandingMode = 'solicitar' | 'recuperar';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  private readonly api = inject(ApiService);
  private readonly userSession = inject(UserSessionService);

  readonly sessionRecovered = output<void>();

  readonly activeMode = signal<LandingMode>('solicitar');

  // Formulario de Solicitud de Sesión (Correo + Código numérico)
  readonly requestStep = signal<'form' | 'verify'>('form');
  readonly requestEmail = signal<string>('');
  readonly verificationCode = signal<string>('');
  readonly verificationNotice = signal<string>('');
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
    const email = this.requestEmail().trim();

    if (!email) {
      this.requestError.set('Por favor, introduce tu correo electrónico.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.requestError.set('Introduce una dirección de correo electrónico con formato válido.');
      return;
    }

    this.requestLoading.set(true);
    this.requestError.set('');
    this.requestSuccess.set(false);

    this.api.requestSessionByEmail(email).subscribe({
      next: (res) => {
        this.requestLoading.set(false);
        if (res?.requiereVerificacion !== false && !res?.solicitado) {
          this.verificationCode.set('');
          this.verificationNotice.set(
            res?.mensaje ||
              'Hemos enviado un código numérico de 6 dígitos a tu correo electrónico.'
          );
          this.requestStep.set('verify');
          return;
        }
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
            'No se ha encontrado ningún usuario con ese correo electrónico en la base de datos.'
          )
        );
      },
    });
  }

  onVerificationCodeInput(value: string): void {
    const digitsOnly = String(value ?? '').replace(/\D+/g, '').slice(0, 6);
    this.verificationCode.set(digitsOnly);
  }

  submitVerificationCode(): void {
    const code = this.verificationCode().trim();
    if (!/^\d{6}$/.test(code)) {
      this.requestError.set(
        'Introduce el código numérico de 6 dígitos que has recibido en tu correo.'
      );
      return;
    }

    this.requestLoading.set(true);
    this.requestError.set('');

    this.api.confirmSessionRequestWithCode(this.requestEmail(), code).subscribe({
      next: (res) => {
        this.requestLoading.set(false);
        this.requestSuccess.set(true);
        this.requestSuccessMessage.set(
          res?.mensaje ||
            'Código verificado. Tu solicitud de sesión ha sido registrada correctamente.'
        );
      },
      error: (err: unknown) => {
        this.requestLoading.set(false);
        this.requestError.set(
          extractErrorMessage(
            err,
            'El código numérico introducido no es válido o ha caducado.'
          )
        );
      },
    });
  }

  resendVerificationCode(): void {
    const email = this.requestEmail().trim();
    if (!email || this.requestLoading()) {
      return;
    }

    this.requestLoading.set(true);
    this.requestError.set('');

    this.api.requestSessionByEmail(email).subscribe({
      next: (res) => {
        this.requestLoading.set(false);
        this.verificationCode.set('');
        this.verificationNotice.set(
          res?.mensaje ||
            'Hemos enviado un nuevo código numérico de 6 dígitos a tu correo electrónico.'
        );
      },
      error: (err: unknown) => {
        this.requestLoading.set(false);
        this.requestError.set(
          extractErrorMessage(err, 'No se pudo reenviar el código de verificación.')
        );
      },
    });
  }

  backToRequestForm(): void {
    this.requestStep.set('form');
    this.verificationCode.set('');
    this.verificationNotice.set('');
    this.requestError.set('');
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
