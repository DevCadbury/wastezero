import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupportService, SupportTicket } from '../../../services/support.service';

@Component({
  selector: 'app-admin-support',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-support.component.html',
})
export class AdminSupportComponent implements OnInit {
  tickets: SupportTicket[] = [];
  total = 0;
  loading = true;
  filterStatus = '';
  page = 1;

  activeTicket: SupportTicket | null = null;
  newStatus = '';
  adminResponse = '';
  replyContent = '';
  replyFile: File | null = null;
  saving = false;
  toast = '';

  statuses = ['open', 'in-progress', 'resolved', 'closed'];
  statusColors: Record<string, string> = {
    open: 'badge-open',
    'in-progress': 'badge-accepted',
    resolved: 'badge-completed',
    closed: 'badge-cancelled',
  };

  categories = ['account', 'pickup', 'payment', 'bug', 'feature', 'other'];

  constructor(private svc: SupportService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.svc.allTickets({ status: this.filterStatus || undefined, page: this.page }).subscribe({
      next: (r) => { this.tickets = r.tickets; this.total = r.total; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  setFilter(s: string) { this.filterStatus = s; this.page = 1; this.load(); }

  openTicket(t: SupportTicket) {
    this.svc.getTicket(t._id).subscribe({
      next: (full) => {
        this.activeTicket = full;
        this.newStatus = full.status;
        this.adminResponse = full.adminResponse || '';
        this.cdr.markForCheck();
      },
    });
  }

  closeDetail() { this.activeTicket = null; this.replyContent = ''; this.replyFile = null; }

  saveStatus() {
    if (!this.activeTicket) return;
    this.saving = true;
    this.svc.updateStatus(this.activeTicket._id, this.newStatus, this.adminResponse).subscribe({
      next: (t) => {
        this.activeTicket = { ...this.activeTicket!, status: t.status, adminResponse: t.adminResponse };
        const idx = this.tickets.findIndex(x => x._id === t._id);
        if (idx >= 0) { const arr = [...this.tickets]; arr[idx] = { ...arr[idx], status: t.status }; this.tickets = arr; }
        this.saving = false;
        this.showToast('Status updated');
        this.cdr.markForCheck();
      },
      error: () => { this.saving = false; this.cdr.markForCheck(); },
    });
  }

  onReplyFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.replyFile = input.files[0];
  }

  sendReply() {
    if (!this.activeTicket || (!this.replyContent.trim() && !this.replyFile)) return;
    this.saving = true;
    const fd = new FormData();
    fd.append('content', this.replyContent);
    if (this.replyFile) fd.append('media', this.replyFile);
    this.svc.addReply(this.activeTicket._id, fd).subscribe({
      next: (reply) => {
        if (this.activeTicket) this.activeTicket.replies = [...(this.activeTicket.replies || []), reply];
        this.replyContent = '';
        this.replyFile = null;
        this.saving = false;
        if (this.activeTicket && this.activeTicket.status === 'open') this.activeTicket.status = 'in-progress';
        this.showToast('Reply sent');
        this.cdr.markForCheck();
      },
      error: () => { this.saving = false; this.cdr.markForCheck(); },
    });
  }

  getCategoryLabel(val: string) {
    const map: Record<string,string> = { account:'Account', pickup:'Pickup', payment:'Payment', bug:'Bug', feature:'Feature', other:'Other' };
    return map[val] || val;
  }

  isImage(url: string | null) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  }

  userInitials(name: string): string {
    return (name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  showToast(msg: string) {
    this.toast = msg;
    this.cdr.markForCheck();
    setTimeout(() => { this.toast = ''; this.cdr.markForCheck(); }, 3000);
  }
}
