import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notice = signal<string>('');
  readonly errorMessage = signal<string>('');

  showNotice(message: string): void {
    this.notice.set(message);
    this.errorMessage.set('');
  }

  showError(message: string): void {
    this.errorMessage.set(message);
  }

  clearNotice(): void {
    this.notice.set('');
  }

  clearError(): void {
    this.errorMessage.set('');
  }

  clearAll(): void {
    this.notice.set('');
    this.errorMessage.set('');
  }
}
