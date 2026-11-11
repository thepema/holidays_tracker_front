import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatCardComponent } from './components/stat-card/stat-card.component';
import { AlertBannerComponent } from './components/alert-banner/alert-banner.component';
import { ModalShellComponent } from './components/modal-shell/modal-shell.component';

const SHARED_COMPONENTS = [
  StatCardComponent,
  AlertBannerComponent,
  ModalShellComponent,
] as const;

@NgModule({
  imports: [CommonModule, FormsModule, ...SHARED_COMPONENTS],
  exports: [CommonModule, FormsModule, ...SHARED_COMPONENTS],
})
export class SharedModule {}
