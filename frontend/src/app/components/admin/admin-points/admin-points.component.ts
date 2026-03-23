import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-points',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-points.component.html',
})
export class AdminPointsComponent implements OnInit {
  activeTab: 'manage' | 'logs' = 'manage';

  pointsUsers: any[] = [];
  pointsLoading = true;
  pointsFilter = '';

  logs: any[] = [];
  logsLoading = true;
  logsPage = 1;
  logsPages = 1;
  logsTotal = 0;
  logsLimit = 10;
  logsRecentDays = 30;
  logsSearch = '';
  logsFrom = '';
  logsTo = '';

  selectedUser: any = null;
  showUserHistoryDialog = false;
  userHistory: any[] = [];
  userHistoryLoading = false;
  userHistoryPage = 1;
  userHistoryPages = 1;
  userHistoryTotal = 0;
  userHistoryLimit = 10;
  userHistorySearch = '';
  userHistorySource = '';
  userHistoryFrom = '';
  userHistoryTo = '';

  successMsg = '';
  errorMsg = '';
  adjustReason: Record<string, string> = {};
  adjustDelta: Record<string, number | null> = {};
  adjustingUserId = '';

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadPointsUsers();
  }

  setTab(tab: 'manage' | 'logs') {
    this.activeTab = tab;
    if (tab === 'logs') {
      this.loadLogs(1);
    }
    this.cdr.markForCheck();
  }

  loadPointsUsers() {
    this.pointsLoading = true;
    this.adminService.getPointsUsers().subscribe({
      next: (data) => {
        this.pointsUsers = data || [];
        this.pointsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.pointsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadLogs(page: number = this.logsPage) {
    this.logsLoading = true;
    this.adminService.getPointsLogs({
      page,
      limit: this.logsLimit,
      recentDays: this.logsRecentDays,
      search: this.logsSearch.trim() || undefined,
      from: this.logsFrom || undefined,
      to: this.logsTo || undefined,
    }).subscribe({
      next: (data) => {
        this.logs = data?.items || [];
        this.logsPage = data?.page || 1;
        this.logsPages = data?.pages || 1;
        this.logsTotal = data?.total || 0;
        this.logsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.logsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get filteredPointsUsers(): any[] {
    if (!this.pointsFilter.trim()) return this.pointsUsers;
    const q = this.pointsFilter.toLowerCase();
    return this.pointsUsers.filter((u) =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }

  applyAdjustment(user: any) {
    const delta = Number(this.adjustDelta[user._id] || 0);
    const reason = (this.adjustReason[user._id] || '').trim();

    if (!Number.isFinite(delta) || delta === 0) {
      this.errorMsg = 'Enter a non-zero points adjustment value.';
      this.cdr.markForCheck();
      return;
    }
    if (!reason) {
      this.errorMsg = 'Reason is required for manual points adjustment.';
      this.cdr.markForCheck();
      return;
    }

    this.adjustingUserId = user._id;
    this.errorMsg = '';
    this.successMsg = '';
    this.adminService.adjustUserPoints(user._id, delta, reason).subscribe({
      next: (res) => {
        const updated = res?.user;
        if (updated) {
          const idx = this.pointsUsers.findIndex((u) => u._id === user._id);
          if (idx >= 0) this.pointsUsers[idx] = { ...this.pointsUsers[idx], ...updated };
          if (this.selectedUser?._id === user._id) {
            this.selectedUser = { ...this.selectedUser, ...updated };
          }
        }
        this.adjustDelta[user._id] = null;
        this.adjustReason[user._id] = '';
        this.adjustingUserId = '';
        this.successMsg = res?.message || 'Points adjusted successfully.';
        this.loadLogs(1);
        if (this.selectedUser?._id === user._id) {
          this.loadSelectedUserHistory(1);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.adjustingUserId = '';
        this.errorMsg = err.error?.message || 'Failed to adjust points.';
        this.cdr.markForCheck();
      },
    });
  }

  clearLogFilters() {
    this.logsSearch = '';
    this.logsFrom = '';
    this.logsTo = '';
    this.logsRecentDays = 30;
    this.loadLogs(1);
  }

  openUserHistory(user: any) {
    this.selectedUser = user;
    this.showUserHistoryDialog = true;
    this.userHistorySearch = '';
    this.userHistorySource = '';
    this.userHistoryFrom = '';
    this.userHistoryTo = '';
    this.loadSelectedUserHistory(1);
  }

  closeUserHistory() {
    this.showUserHistoryDialog = false;
    this.selectedUser = null;
    this.userHistory = [];
    this.userHistoryTotal = 0;
    this.userHistoryPage = 1;
    this.userHistoryPages = 1;
    this.cdr.markForCheck();
  }

  loadSelectedUserHistory(page: number = this.userHistoryPage) {
    if (!this.selectedUser?._id) return;
    this.userHistoryLoading = true;
    this.adminService.getPointsUserHistory(this.selectedUser._id, {
      page,
      limit: this.userHistoryLimit,
      search: this.userHistorySearch.trim() || undefined,
      source: this.userHistorySource || undefined,
      from: this.userHistoryFrom || undefined,
      to: this.userHistoryTo || undefined,
    }).subscribe({
      next: (res) => {
        this.selectedUser = { ...this.selectedUser, ...(res?.user || {}) };
        this.userHistory = res?.items || [];
        this.userHistoryPage = res?.page || 1;
        this.userHistoryPages = res?.pages || 1;
        this.userHistoryTotal = res?.total || 0;
        this.userHistoryLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.userHistory = [];
        this.userHistoryLoading = false;
        this.errorMsg = err.error?.message || 'Failed to load user transaction history.';
        this.cdr.markForCheck();
      },
    });
  }

  clearUserHistoryFilters() {
    this.userHistorySearch = '';
    this.userHistorySource = '';
    this.userHistoryFrom = '';
    this.userHistoryTo = '';
    this.loadSelectedUserHistory(1);
  }

  goToLogsPage(page: number) {
    if (page < 1 || page > this.logsPages || page === this.logsPage) return;
    this.loadLogs(page);
  }

  onLogsLimitChange() {
    this.logsLimit = Number(this.logsLimit) || 10;
    this.loadLogs(1);
  }

  goToUserHistoryPage(page: number) {
    if (page < 1 || page > this.userHistoryPages || page === this.userHistoryPage) return;
    this.loadSelectedUserHistory(page);
  }

  onUserHistoryLimitChange() {
    this.userHistoryLimit = Number(this.userHistoryLimit) || 10;
    this.loadSelectedUserHistory(1);
  }

  affectedUserName(log: any): string {
    return log?.user_id?.name || log?.user_id?.username || '-';
  }

  adminName(log: any): string {
    return log?.performedBy?.name || log?.performedBy?.username || '-';
  }

  transactionEditorName(tx: any): string {
    return tx?.performedBy?.name || tx?.performedBy?.username || '-';
  }

  async copyText(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.successMsg = 'Copied to clipboard.';
      this.cdr.markForCheck();
    } catch {
      this.errorMsg = 'Could not copy to clipboard.';
      this.cdr.markForCheck();
    }
  }

  shortId(value: string): string {
    if (!value) return '-';
    if (value.length <= 10) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  formatPoints(points: number): string {
    if (points > 0) return `+${points}`;
    return `${points}`;
  }

  pointsClass(points: number): string {
    return points >= 0 ? 'text-success' : 'text-danger';
  }

  isNegativeLog(log: any): boolean {
    const details = (log?.details || '').toString();
    return /by\s*-\d+/i.test(details);
  }

  isPositiveLog(log: any): boolean {
    const details = (log?.details || '').toString();
    return /by\s*\+?\d+/i.test(details) && !this.isNegativeLog(log);
  }

  logBorderColor(log: any): string {
    if (this.isNegativeLog(log)) return '#fca5a5';
    if (this.isPositiveLog(log)) return '#86efac';
    return '#e2e8f0';
  }

  logBackground(log: any): string {
    if (this.isNegativeLog(log)) return '#fff1f2';
    if (this.isPositiveLog(log)) return '#f0fdf4';
    return 'transparent';
  }

  parseAdjustment(log: any): { delta: number | null; before: number | null; after: number | null; credited: number; debited: number; current: number | null; txId: string | null } {
    const details = (log?.details || '').toString();
    const deltaMatch = details.match(/by\s*([+-]?\d+)/i);
    const beforeMatch = details.match(/Before=([-]?\d+)/i);
    const afterMatch = details.match(/After=([-]?\d+)/i);
    const txIdMatch = details.match(/TxID=([a-f0-9]{24})/i);

    const delta = deltaMatch ? Number(deltaMatch[1]) : null;
    const before = beforeMatch ? Number(beforeMatch[1]) : null;
    const after = afterMatch ? Number(afterMatch[1]) : null;

    const credited = delta !== null && delta > 0 ? delta : 0;
    const debited = delta !== null && delta < 0 ? Math.abs(delta) : 0;

    return {
      delta,
      before,
      after,
      credited,
      debited,
      current: after,
      txId: txIdMatch ? txIdMatch[1] : null,
    };
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
}
