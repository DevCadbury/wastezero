import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  activeTab: 'login' | 'register' = 'login';
  loading = false;
  errorMsg = '';
  successMsg = '';

  loginForm = { username: '', password: '' };

  registerForm = {
    name: '', email: '', username: '', password: '', confirmPassword: '',
    role: 'user', skills: '', location: '', bio: '', phone: '',
  };

  constructor(private authService: AuthService, private router: Router) {}

  switchTab(tab: 'login' | 'register') {
    this.activeTab = tab;
    this.errorMsg = '';
    this.successMsg = '';
  }

  onLogin() {
    this.errorMsg = '';
    if (!this.loginForm.username || !this.loginForm.password) {
      this.errorMsg = 'Please enter username and password.';
      return;
    }
    this.loading = true;
    this.authService.login(this.loginForm).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/dashboard']); },
      error: (err) => { this.loading = false; this.errorMsg = err.error?.message || 'Login failed.'; },
    });
  }

  onRegister() {
    this.errorMsg = '';
    const { name, email, username, password, confirmPassword } = this.registerForm;
    if (!name || !email || !username || !password) {
      this.errorMsg = 'Please fill all required fields.';
      return;
    }
    if (password !== confirmPassword) {
      this.errorMsg = 'Passwords do not match.';
      return;
    }
    if (password.length < 6) {
      this.errorMsg = 'Password must be at least 6 characters.';
      return;
    }

    this.loading = true;
    const payload = {
      ...this.registerForm,
      skills: this.registerForm.skills ? this.registerForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    this.authService.register(payload).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/dashboard']); },
      error: (err) => { this.loading = false; this.errorMsg = err.error?.message || 'Registration failed.'; },
    });
  }
}
