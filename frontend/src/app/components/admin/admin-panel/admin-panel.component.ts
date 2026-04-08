import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminService } from '../../../services/admin.service';
import { AdminStat } from '../../../models/models';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-panel.component.html',
})
export class AdminPanelComponent implements OnInit {
  stats: AdminStat | null = null;
  loading = true;
  alertSending = false;
  alertSuccess = '';
  alertError = '';
  alertForm = {
    title: '',
    message: '',
    targetRole: 'all' as 'all' | 'user' | 'volunteer' | 'admin',
  };

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.adminService.getStats().subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get applicationStatusRows(): Array<{ label: string; value: number; color: string }> {
    const status = this.stats?.applicationByStatus;
    if (!status) return [];
    return [
      { label: 'Pending', value: status.pending || 0, color: '#f59e0b' },
      { label: 'Accepted', value: status.accepted || 0, color: '#15803d' },
      { label: 'Rejected', value: status.rejected || 0, color: '#dc2626' },
    ];
  }

  get maxApplicationStatusValue(): number {
    const rows = this.applicationStatusRows;
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => r.value), 1);
  }

  sendAlert() {
    this.alertSuccess = '';
    this.alertError = '';

    const title = this.alertForm.title.trim();
    const message = this.alertForm.message.trim();

    if (!title || !message) {
      this.alertError = 'Alert title and message are required.';
      this.cdr.markForCheck();
      return;
    }

    this.alertSending = true;
    this.adminService.broadcastAlert({
      title,
      message,
      targetRole: this.alertForm.targetRole,
    }).subscribe({
      next: (res) => {
        this.alertSending = false;
        this.alertSuccess = `Alert sent successfully to ${res?.recipients || 0} user(s).`;
        this.alertForm = { title: '', message: '', targetRole: this.alertForm.targetRole };
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.alertSending = false;
        this.alertError = err?.error?.message || 'Failed to send alert.';
        this.cdr.markForCheck();
      },
    });
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}