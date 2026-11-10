import { Routes } from '@angular/router';
import { AdminPortalPageComponent } from './features/admin/pages/admin-portal-page/admin-portal-page.component';
import { InvitationActivationComponent } from './features/invitation/pages/invitation-activation/invitation-activation.component';

export const routes: Routes = [
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
    path: '',
    pathMatch: 'full',
    redirectTo: 'administracion',
  },
  {
    path: '**',
    redirectTo: 'administracion',
  },
];
