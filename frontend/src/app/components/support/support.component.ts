import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupportService, SupportTicket } from '../../services/support.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-support',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './support.component.html',
})
export class SupportComponent implements OnInit {
  tickets: SupportTicket[] = [];
  loading = true;
  error = '';
  toast = '';

  // Form
  showForm = false;
  submitting = false;
  form = { category: 'other', subject: '', description: '' };
  selectedFile: File | null = null;
  filePreview: string | null = null;

  // Detail view
  activeTicket: SupportTicket | null = null;
  replyContent = '';
  replyFile: File | null = null;
  sendingReply = false;

  categories = [
    { value: 'account', label: 'Account Issue' },
    { value: 'pickup', label: 'Pickup Problem' },
    { value: 'payment', label: 'Payment' },
    { value: 'bug', label: 'Bug Report' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'chat-report', label: 'Chat Report' },
    { value: 'other', label: 'Other' },
  ];

  statusColors: Record<string, string> = {
    open: 'badge-open',
    'in-progress': 'badge-accepted',
    resolved: 'badge-completed',
    closed: 'badge-cancelled',
  };

  constructor(
    private supportService: SupportService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.supportService.myTickets().subscribe({
      next: (t) => { this.tickets = t; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'Failed to load tickets'; this.cdr.markForCheck(); },
    });
  }

  onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
      if (this.selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (r) => { this.filePreview = r.target?.result as string; this.cdr.markForCheck(); };
        reader.readAsDataURL(this.selectedFile);
      } else {
        this.filePreview = null;
      }
    }
  }

  onReplyFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.replyFile = input.files[0];
  }

  submitTicket() {
    if (!this.form.subject.trim() || !this.form.description.trim()) return;
    this.submitting = true;
    const fd = new FormData();
    fd.append('category', this.form.category);
    fd.append('subject', this.form.subject);
    fd.append('description', this.form.description);
    if (this.selectedFile) fd.append('media', this.selectedFile);
    this.supportService.createTicket(fd).subscribe({
      next: (t) => {
        this.tickets = [t, ...this.tickets];
        this.showForm = false;
        this.form = { category: 'other', subject: '', description: '' };
        this.selectedFile = null;
        this.filePreview = null;
        this.submitting = false;
        this.showToast('Ticket submitted successfully!');
        this.cdr.markForCheck();
      },
      error: (err) => { this.submitting = false; this.error = err?.error?.message || 'Failed to submit'; this.cdr.markForCheck(); },
    });
  }

  openTicket(t: SupportTicket) {
    this.supportService.getTicket(t._id).subscribe({
      next: (full) => { this.activeTicket = full; this.cdr.markForCheck(); },
      error: () => { this.activeTicket = t; this.cdr.markForCheck(); },
    });
  }

  closeDetail() {
    this.activeTicket = null;
    this.replyContent = '';
    this.replyFile = null;
  }

  sendReply() {
    if (!this.replyContent.trim() && !this.replyFile) return;
    if (!this.activeTicket) return;
    this.sendingReply = true;
    const fd = new FormData();
    fd.append('content', this.replyContent);
    if (this.replyFile) fd.append('media', this.replyFile);
    this.supportService.addReply(this.activeTicket._id, fd).subscribe({
      next: (reply) => {
        if (this.activeTicket) this.activeTicket.replies = [...(this.activeTicket.replies || []), reply];
        this.replyContent = '';
        this.replyFile = null;
        this.sendingReply = false;
        this.cdr.markForCheck();
      },
      error: () => { this.sendingReply = false; this.cdr.markForCheck(); },
    });
  }

  showToast(msg: string) {
    this.toast = msg;
    this.cdr.markForCheck();
    setTimeout(() => { this.toast = ''; this.cdr.markForCheck(); }, 3500);
  }

  getCategoryLabel(val: string) {
    return this.categories.find(c => c.value === val)?.label || val;
  }

  isImage(url: string | null) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  }
}
