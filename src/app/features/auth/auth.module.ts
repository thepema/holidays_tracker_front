import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { LoginPageComponent } from './components/login-page/login-page.component';

@NgModule({
  imports: [SharedModule, LoginPageComponent],
  exports: [LoginPageComponent],
})
export class AuthModule {}
