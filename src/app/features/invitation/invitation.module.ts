import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { InvitationActivationComponent } from './pages/invitation-activation/invitation-activation.component';

@NgModule({
  imports: [CommonModule, RouterModule, InvitationActivationComponent],
  exports: [InvitationActivationComponent],
})
export class InvitationModule {}
