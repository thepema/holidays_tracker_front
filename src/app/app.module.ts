import { NgModule } from '@angular/core';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './features/auth/auth.module';
import { AdminModule } from './features/admin/admin.module';

@NgModule({
  imports: [CoreModule, SharedModule, AuthModule, AdminModule],
  exports: [SharedModule, AuthModule, AdminModule],
})
export class AppModule {}
