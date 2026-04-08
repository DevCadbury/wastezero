import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { UploadService } from '../../services/upload.service';
import { User } from '../../models/models';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  activeTab: 'profile' | 'password' = 'profile';
  loading = false;
  successMsg = '';
  errorMsg = '';

  profileForm: any = {
    emailPreferences: {
      enabled: true,
      generalNotifications: true,
      systemAlerts: true,
      messages: true,
      support: true,
      opportunities: true,
      pickups: true,
      security: true,
    },
  };
  passwordForm = { currentPassword: '', newPassword: '', confirmNew: '' };
  avatarFile: File | null = null;
  avatarPreview: string | null = null;

  constructor(
    public auth: AuthService,
    private userService: UserService,
    private uploadService: UploadService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.user = this.auth.currentUser;
    this.initForm();
    this.userService.getProfile().subscribe({
      next: (u) => { this.user = u; this.initForm(); },
      error: () => {},
    });
  }

  initForm() {
    if (!this.user) return;
    this.profileForm = {
      name: this.user.name,
      email: this.user.email,
      location: this.user.location || '',
      bio: this.user.bio || '',
      phone: this.user.phone || '',
      skills: Array.isArray(this.user.skills) ? this.user.skills.join(', ') : '',
      emailPreferences: {
        enabled: this.user.emailPreferences?.enabled !== false,
        generalNotifications: this.user.emailPreferences?.generalNotifications !== false,
        systemAlerts: this.user.emailPreferences?.systemAlerts !== false,
        messages: this.user.emailPreferences?.messages !== false,
        support: this.user.emailPreferences?.support !== false,
        opportunities: this.user.emailPreferences?.opportunities !== false,
        pickups: this.user.emailPreferences?.pickups !== false,
        security: this.user.emailPreferences?.security !== false,
      },
    };
  }

  saveProfile() {
    this.loading = true; this.errorMsg = ''; this.successMsg = '';
    const payload: any = {
      ...this.profileForm,
      skills: this.profileForm.skills ? this.profileForm.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      emailPreferences: {
        enabled: !!this.profileForm.emailPreferences?.enabled,
        generalNotifications: !!this.profileForm.emailPreferences?.generalNotifications,
        systemAlerts: !!this.profileForm.emailPreferences?.systemAlerts,
        messages: !!this.profileForm.emailPreferences?.messages,
        support: !!this.profileForm.emailPreferences?.support,
        opportunities: !!this.profileForm.emailPreferences?.opportunities,
        pickups: !!this.profileForm.emailPreferences?.pickups,
        security: !!this.profileForm.emailPreferences?.security,
      },
    };

    const submitProfile = () => this.userService.updateProfile(payload).subscribe({
      next: (u) => {
        this.loading = false;
        this.successMsg = 'Profile updated successfully!';
        this.auth.updateCurrentUser(u);
        this.user = u;
        this.avatarFile = null;
        this.avatarPreview = null;
        this.cdr.markForCheck();
      },
      error: (err) => { this.loading = false; this.errorMsg = err.error?.message || 'Update failed'; this.cdr.markForCheck(); },
    });

    if (!this.avatarFile) {
      submitProfile();
      return;
    }

    this.uploadService.uploadSingle(this.avatarFile, 'avatars').subscribe({
      next: (res) => {
        payload.avatar = res.url;
        submitProfile();
      },
      error: () => {
        this.loading = false;
        this.errorMsg = 'Avatar upload failed. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  onAvatarChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.errorMsg = 'Please select an image file for avatar.';
      this.cdr.markForCheck();
      return;
    }

    this.avatarFile = file;
    const reader = new FileReader();
    reader.onload = (r) => {
      this.avatarPreview = r.target?.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  clearAvatarSelection() {
    this.avatarFile = null;
    this.avatarPreview = null;
    this.cdr.markForCheck();
  }

  changePassword() {
    this.errorMsg = ''; this.successMsg = '';
    const { currentPassword, newPassword, confirmNew } = this.passwordForm;
    if (!currentPassword || !newPassword) { this.errorMsg = 'Please fill all fields'; return; }
    if (newPassword !== confirmNew) { this.errorMsg = 'New passwords do not match'; return; }
    if (newPassword.length < 6) { this.errorMsg = 'Password must be at least 6 characters'; return; }
    this.loading = true;
    this.userService.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => { this.loading = false; this.successMsg = 'Password changed successfully!'; this.passwordForm = { currentPassword: '', newPassword: '', confirmNew: '' }; },
      error: (err) => { this.loading = false; this.errorMsg = err.error?.message || 'Failed'; },
    });
  }

  get initials(): string {
    return this.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  get currentAvatar(): string | null {
    return this.avatarPreview || this.user?.avatar || null;
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}