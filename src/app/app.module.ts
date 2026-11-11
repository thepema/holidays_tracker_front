import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './features/auth/auth.module';
import { AdminModule } from './features/admin/admin.module';
import { InvitationModule } from './features/invitation/invitation.module';
import { UserPortalModule } from './features/user-portal/user-portal.module';

@NgModule({
  imports: [
    CoreModule,
    RouterModule,
    SharedModule,
    AuthModule,
    AdminModule,
    InvitationModule,
    UserPortalModule,
  ],
  exports: [
    RouterModule,
    SharedModule,
    AuthModule,
    AdminModule,
    InvitationModule,
    UserPortalModule,
  ],
})
export class AppModule {}
