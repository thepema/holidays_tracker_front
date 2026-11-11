import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { UserSessionService } from '../services/user-session.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const userSession = inject(UserSessionService);
  const adminToken = authService.token();
  const sessionToken = userSession.sessionToken();

  const headers: Record<string, string> = {};
  if (adminToken && !req.headers.has('Authorization')) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }
  if (sessionToken && !req.headers.has('X-Session-Token')) {
    headers['X-Session-Token'] = sessionToken;
  }

  const cloned = req.clone({
    withCredentials: true,
    ...(Object.keys(headers).length > 0 ? { setHeaders: headers } : {}),
  });

  return next(cloned);
};
