import { NgModule } from '@angular/core';
import { LandingPageComponent } from './pages/landing-page/landing-page.component';
import { UserDashboardComponent } from './pages/user-dashboard/user-dashboard.component';
import { UserPortalPageComponent } from './pages/user-portal-page/user-portal-page.component';

@NgModule({
  imports: [LandingPageComponent, UserDashboardComponent, UserPortalPageComponent],
  exports: [LandingPageComponent, UserDashboardComponent, UserPortalPageComponent],
})
export class UserPortalModule {}
