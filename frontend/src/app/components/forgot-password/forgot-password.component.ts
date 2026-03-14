import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  email = '';
  loading = false;
  success = false;
  error = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  submit() {
    if (!this.email.trim()) return;
    this.loading = true;
    this.error = '';
    this.http.post(`${environment.apiUrl}/auth/forgot-password`, { email: this.email }).subscribe({
      next: () => {
        this.success = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = err.error?.error || 'Something went wrong. Please try again.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
