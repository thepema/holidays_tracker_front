import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const adminToken = authService.token();

  const headers: Record<string, string> = {};
  if (adminToken && !req.headers.has('Authorization')) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }

  const cloned = req.clone({
    withCredentials: true,
    ...(Object.keys(headers).length > 0 ? { setHeaders: headers } : {}),
  });

  return next(cloned);
};
