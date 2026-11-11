import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminUser,
  getUserDisplayName,
  getUserInitials,
  getVacationTypeLabel,
  hasActiveSession,
  isUserPending,
} from '../../../../core/models/user.model';
import { UserColorPalette, getUserColor } from '../../../../core/models/vacation.model';

@Component({
  selector: 'app-team-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './team-panel.component.html',
  styleUrl: './team-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPanelComponent implements AfterViewInit, OnDestroy {
  readonly users = input.required<AdminUser[]>();
  readonly pendingCount = input.required<number>();
  readonly userYearCounts = input.required<Map<number, number>>();

  readonly createClick = output<void>();
  readonly bulkInviteClick = output<void>();
  readonly editUser = output<AdminUser>();
  readonly addVacations = output<AdminUser>();
  readonly resendInvite = output<AdminUser>();
  readonly closeSession = output<AdminUser>();

  protected readonly searchTerm = signal<string>('');
  protected readonly menuUser = signal<AdminUser | null>(null);
  protected readonly menuPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  private readonly popup = viewChild.required<ElementRef<HTMLElement>>('popup');
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly scrollListener = (e: Event): void => {
    if (!this.popup().nativeElement.contains(e.target as Node)) {
      this.closeMenu();
    }
  };

  protected readonly filteredUsers = computed<AdminUser[]>(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const all = this.users();
    if (!query) {
      return all;
    }
    return all.filter((u) => {
      const fullName = getUserDisplayName(u).toLowerCase();
      return (
        fullName.includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.cargo.toLowerCase().includes(query)
      );
    });
  });

  protected isPending(user: AdminUser): boolean {
    return isUserPending(user);
  }

  protected displayName(user: AdminUser): string {
    return getUserDisplayName(user);
  }

  protected initials(user: AdminUser): string {
    return getUserInitials(user);
  }

  protected userColor(user: AdminUser): UserColorPalette {
    return getUserColor(user.id, getUserDisplayName(user));
  }

  protected yearCount(userId: number): number {
    return this.userYearCounts().get(userId) ?? 0;
  }

  protected vacationTypeLabel(value: string): string {
    return getVacationTypeLabel(value);
  }

  protected hasActiveSession(user: AdminUser): boolean {
    return hasActiveSession(user);
  }

  protected toggleMenu(event: MouseEvent, user: AdminUser): void {
    event.stopPropagation();
    if (this.menuUser()?.id === user.id) {
      this.closeMenu();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuUser.set(user);
    this.menuPos.set({ x: rect.right, y: rect.bottom + 4 });
    // Tras renderizar, centrar/ajustar con las dimensiones reales del popup.
    setTimeout(() => this.placeMenu(rect));
  }

  protected runAction(callback: () => void): void {
    this.closeMenu();
    callback();
  }

  protected onEditUser(user: AdminUser): void {
    this.closeMenu();
    this.editUser.emit(user);
  }

  protected onAddVacations(user: AdminUser): void {
    this.closeMenu();
    this.addVacations.emit(user);
  }

  protected onResendInvite(user: AdminUser): void {
    this.closeMenu();
    this.resendInvite.emit(user);
  }

  protected onCloseSession(user: AdminUser): void {
    this.closeMenu();
    this.closeSession.emit(user);
  }

  private placeMenu(anchor: DOMRect): void {
    const el = this.popup().nativeElement;
    const margin = 8;
    const { offsetWidth: w, offsetHeight: h } = el;
    let x = anchor.right - w;
    x = Math.max(margin, Math.min(x, window.innerWidth - w - margin));
    let y = anchor.bottom + 4;
    if (y + h > window.innerHeight - margin) {
      y = Math.max(margin, anchor.top - h - 4);
    }
    this.menuPos.set({ x, y });
    this.cdr.markForCheck();
  }

  private closeMenu(): void {
    if (this.menuUser() !== null) {
      this.menuUser.set(null);
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuUser() && !this.popup().nativeElement.contains(event.target as Node)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  protected onDismiss(): void {
    this.closeMenu();
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    this.closeMenu();
  }

  ngAfterViewInit(): void {
    document.body.appendChild(this.popup().nativeElement);
    // El listado tiene scroll propio: cerrar el menú al desplazarlo.
    document.addEventListener('scroll', this.scrollListener, true);
  }

  ngOnDestroy(): void {
    this.popup().nativeElement.remove();
    document.removeEventListener('scroll', this.scrollListener, true);
  }
}
