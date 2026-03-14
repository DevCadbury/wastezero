import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  password = '';
  confirmPassword = '';
  loading = false;
  success = false;
  error = '';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.error = 'Invalid or missing reset token. Please request a new link.';
      this.cdr.markForCheck();
    }
  }

  submit() {
    if (!this.password || this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }
    if (this.password.length < 6) {
      this.error = 'Password must be at least 6 characters.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.http.post(`${environment.apiUrl}/auth/reset-password`, { token: this.token, password: this.password }).subscribe({
      next: () => {
        this.success = true;
        this.loading = false;
        this.cdr.markForCheck();
        setTimeout(() => this.router.navigate(['/auth']), 2500);
      },
      error: (err) => {
        this.error = err.error?.error || 'Reset failed. The link may have expired.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
