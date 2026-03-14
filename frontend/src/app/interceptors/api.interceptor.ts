import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // 1. Attach Bearer token to all /api requests
  const token = auth.token;
  const isApiCall = req.url.includes('/api/');
  let authedReq = isApiCall && token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  // Force fresh reads so UI updates without manual refresh.
  if (authedReq.method === 'GET' && isApiCall) {
    authedReq = authedReq.clone({
      setHeaders: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }

  return next(authedReq).pipe(
    tap((event) => {
      // Keep side-effect hook for future request instrumentation.
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(authedReq.method) && isApiCall) {
        void event;
      }
    })
  );
};
