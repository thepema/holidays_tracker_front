import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService, SessionActivationResponse } from '../../../../core/services/api.service';
import { UserSessionProfile, UserSessionService } from '../../../../core/services/user-session.service';
import { extractErrorMessage } from '../../../../core/utils/http-helpers';

type ActivationState = 'cargando' | 'exito' | 'error';

@Component({
  selector: 'app-invitation-activation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './invitation-activation.component.html',
  styleUrls: ['./invitation-activation.component.css'],
})
export class InvitationActivationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly userSession = inject(UserSessionService);

  readonly state = signal<ActivationState>('cargando');
  readonly errorMessage = signal<string>('');
  readonly recoveryCode = signal<string>('');
  readonly userProfile = signal<UserSessionProfile | null>(null);
  readonly copied = signal<boolean>(false);
  readonly codeConfirmed = signal<boolean>(false);

  readonly userDisplayName = computed(() => {
    const user = this.userProfile();
    if (!user) return '';
    return `${user.nombre} ${user.apellidos}`.trim() || user.nombre;
  });

  ngOnInit(): void {
    const code = this.extractInvitationCode();
    if (!code) {
      this.state.set('error');
      this.errorMessage.set(
        'El enlace no contiene un código de invitación válido. Comprueba la URL recibida.'
      );
      return;
    }

    this.activateInvitation(code);
  }

  private extractInvitationCode(): string {
    const fromParams = this.route.snapshot.paramMap.get('codigo_invitacion');
    if (fromParams && fromParams.trim()) {
      return fromParams.trim();
    }
    const fromQuery = this.route.snapshot.queryParamMap.get('codigo');
    if (fromQuery && fromQuery.trim()) {
      return fromQuery.trim();
    }
    return '';
  }

  private activateInvitation(code: string): void {
    this.state.set('cargando');
    this.errorMessage.set('');

    this.api.activateSession(code).subscribe({
      next: (response: SessionActivationResponse) => {
        const { usuario, token, codigoRecuperacion } = response;
        this.recoveryCode.set(codigoRecuperacion);
        this.userProfile.set(usuario);

        // Guardar sesión permanente en localStorage y cookie del navegador
        this.userSession.saveSession(usuario, token);

        this.state.set('exito');
      },
      error: (err: unknown) => {
        this.state.set('error');
        this.errorMessage.set(
          extractErrorMessage(
            err,
            'El código de invitación no es válido, ha caducado o ya ha sido utilizado.'
          )
        );
      },
    });
  }

  retry(): void {
    const code = this.extractInvitationCode();
    if (code) {
      this.activateInvitation(code);
    }
  }

  async copyRecoveryCode(): Promise<void> {
    const code = this.recoveryCode();
    if (!code) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Fallback
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    }
  }

  downloadRecoveryCode(): void {
    const code = this.recoveryCode();
    const user = this.userProfile();
    if (!code) return;

    const content = [
      '====================================================',
      'HOLIDAYS TRACKER — CÓDIGO DE RECUPERACIÓN DE SESIÓN',
      '====================================================',
      '',
      `Usuario: ${user ? `${user.nombre} ${user.apellidos} (${user.email})` : 'Usuario'}`,
      `Fecha de activación: ${new Date().toLocaleString('es-ES')}`,
      '',
      'CÓDIGO DE RECUPERACIÓN:',
      code,
      '',
      'IMPORTANTE:',
      '- Tu sesión en este navegador queda guardada indefinidamente.',
      '- Si cambias de navegador, dispositivo o borras las cookies/datos del navegador,',
      '  necesitarás este código para volver a identificarte o restablecer tu sesión.',
      '- Guarda este archivo en un lugar seguro y privado.',
      '====================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `holidays-tracker-recuperacion-${user?.nombre?.toLowerCase() || 'codigo'}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  toggleConfirmed(): void {
    this.codeConfirmed.update((val) => !val);
  }

  continueToApp(): void {
    // Redirigir a la vista principal
    this.router.navigate(['/']);
  }
}
