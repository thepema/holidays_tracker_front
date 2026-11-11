import { Routes } from '@angular/router';
import { AdminPortalPageComponent } from './features/admin/pages/admin-portal-page/admin-portal-page.component';
import { InvitationActivationComponent } from './features/invitation/pages/invitation-activation/invitation-activation.component';
import { UserPortalPageComponent } from './features/user-portal/pages/user-portal-page/user-portal-page.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: UserPortalPageComponent,
    title: 'Holidays Tracker · Portal de Vacaciones',
  },
  {
    path: 'vacaciones',
    component: UserPortalPageComponent,
    title: 'Holidays Tracker · Mis Vacaciones',
  },
  {
    path: 'invitacion/:codigo_invitacion',
    component: InvitationActivationComponent,
    title: 'Holidays Tracker · Activar invitación',
  },
  {
    path: 'invitacion',
    component: InvitationActivationComponent,
    title: 'Holidays Tracker · Activar invitación',
  },
  {
    path: 'administracion',
    component: AdminPortalPageComponent,
    title: 'Holidays Tracker · Administración',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
