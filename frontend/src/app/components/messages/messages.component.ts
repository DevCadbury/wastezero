import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { Message } from '../../models/models';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
})
export class MessagesComponent implements OnInit, OnDestroy {
  @ViewChild('msgEnd') msgEnd!: ElementRef;
  @ViewChild('fileInput') fileInputEl!: ElementRef;

  conversations: any[] = [];
  messages: Message[] = [];
  selectedConv: any = null;
  newMessage = '';
  loading = true;
  sending = false;
  allowedContacts: any[] = [];
  allowedContactIds = new Set<string>();
  selectedConvLocked = false;
  selectedConvLockAt: string | null = null;

  // User search
  userSearchQuery = '';
  userSearchResults: any[] = [];
  showUserSearch = false;
  private searchSubject = new Subject<string>();

  // Media
  selectedFile: File | null = null;
  filePreview: string | null = null;
  fileType: 'image' | 'video' | 'file' | null = null;

  // Typing
  typingUser: string | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingDebounce: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private convPollTimer: ReturnType<typeof setInterval> | null = null;
  private pendingDirectUserId: string | null = null;

  constructor(
    public auth: AuthService,
    private messageService: MessageService,
    private socketService: SocketService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadAllowedContacts();
    this.loadConversations();
    this.convPollTimer = setInterval(() => this.loadConversations(), 15_000);

    // Real-time messages
    this.subs.push(
      this.socketService.on<any>('chat:message').subscribe((msg) => {
        const senderId = typeof msg.sender_id === 'object' ? msg.sender_id._id : msg.sender_id;
        const partnerId = this.selectedConv?.partner?._id;
        if (partnerId && senderId === partnerId) {
          this.messages = [...this.messages, msg];
          this.cdr.markForCheck();
          setTimeout(() => this.scrollBottom(), 80);
        }
        this.loadConversations();
      }),
    );

    // Typing indicator
    this.subs.push(
      this.socketService.on<any>('chat:typing').subscribe((data) => {
        if (this.selectedConv?.partner?._id === data.senderId) {
          this.typingUser = data.typing ? data.senderName : null;
          if (this.typingTimeout) clearTimeout(this.typingTimeout);
          if (data.typing) this.typingTimeout = setTimeout(() => { this.typingUser = null; this.cdr.markForCheck(); }, 3000);
          this.cdr.markForCheck();
        }
      }),
    );

    // User search with debounce
    this.subs.push(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(q => q.length >= 2 ? this.messageService.searchUsers(q) : []),
      ).subscribe({
        next: (results) => { this.userSearchResults = results; this.cdr.markForCheck(); },
      }),
    );

    // Handle queryParam ?user=id (from volt-pickups Contact User)
    this.subs.push(
      this.route.queryParams.subscribe(params => {
        if (params['user']) {
          this.pendingDirectUserId = params['user'];
          this.openDirectMessage(params['user']);
        }
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    if (this.convPollTimer) clearInterval(this.convPollTimer);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingDebounce) clearTimeout(this.typingDebounce);
  }

  loadAllowedContacts() {
    this.messageService.getAllowedContacts().subscribe({
      next: (users) => {
        this.allowedContacts = users || [];
        this.allowedContactIds = new Set((this.allowedContacts || []).map((u: any) => u._id));
        if (this.pendingDirectUserId) {
          this.openDirectMessage(this.pendingDirectUserId);
          this.pendingDirectUserId = null;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.allowedContacts = [];
        this.allowedContactIds = new Set<string>();
        this.cdr.markForCheck();
      },
    });
  }

  loadConversations() {
    this.messageService.getConversations().subscribe({
      next: (data) => {
        this.conversations = (data || []).filter((c: any) => c?.partner?._id && (c?.lastMessage?.content != null || c?.lastMessage?.mediaUrl != null));

        if (this.selectedConv?.partner?._id) {
          const latest = this.conversations.find(c => c.partner?._id === this.selectedConv.partner._id);
          if (latest) {
            this.selectedConv = latest;
            this.selectedConvLocked = !!latest.locked;
            this.selectedConvLockAt = latest.lockAt || null;
          }
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  selectConversation(conv: any) {
    this.selectedConv = conv;
    this.selectedConvLocked = !!conv?.locked;
    this.selectedConvLockAt = conv?.lockAt || null;
    this.typingUser = null;
    this.showUserSearch = false;
    this.loadMessages(conv.partner._id, true);
  }

  openDirectMessage(userId: string) {
    // Check if already in conversations
    const existing = this.conversations.find(c => c.partner?._id === userId);
    if (existing) { this.selectConversation(existing); return; }

    const contact = this.allowedContacts.find((u: any) => u._id === userId);
    if (contact) {
      this.selectedConv = { partner: contact, lastMessage: null, unreadCount: 0, locked: false, lockAt: null };
      this.messages = [];
      this.selectedConvLocked = false;
      this.selectedConvLockAt = null;
      this.cdr.markForCheck();
    }
  }

  loadMessages(partnerId: string, scroll = true) {
    this.messageService.getMessages(partnerId).subscribe({
      next: (data) => {
        this.messages = data?.messages || [];
        this.selectedConvLocked = !!data?.locked;
        this.selectedConvLockAt = data?.lockAt || null;
        this.cdr.markForCheck();
        if (scroll) setTimeout(() => this.scrollBottom(), 80);
      },
      error: () => {},
    });
  }

  onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.selectedFile = input.files[0];
    const mt = this.selectedFile.type;
    this.fileType = mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'file';
    if (this.fileType === 'image') {
      const reader = new FileReader();
      reader.onload = r => { this.filePreview = r.target?.result as string; this.cdr.markForCheck(); };
      reader.readAsDataURL(this.selectedFile);
    } else {
      this.filePreview = null;
    }
    this.cdr.markForCheck();
  }

  clearFile() { this.selectedFile = null; this.filePreview = null; this.fileType = null; }

  send() {
    if ((!this.newMessage.trim() && !this.selectedFile) || !this.selectedConv || this.selectedConvLocked) return;
    this.sending = true;
    this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: false });

    const fd = new FormData();
    fd.append('receiver_id', this.selectedConv.partner._id);
    fd.append('content', this.newMessage);
    if (this.selectedFile) fd.append('media', this.selectedFile);

    this.messageService.sendMessage(fd).subscribe({
      next: (msg) => {
        this.messages = [...this.messages, msg];
        this.newMessage = '';
        this.clearFile();
        this.sending = false;
        this.cdr.markForCheck();
        this.loadConversations();
        setTimeout(() => this.scrollBottom(), 80);
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  onTyping() {
    if (!this.selectedConv) return;
    if (this.typingDebounce) clearTimeout(this.typingDebounce);
    this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: true });
    this.typingDebounce = setTimeout(() => {
      this.socketService.emit('chat:typing', { receiverId: this.selectedConv.partner._id, typing: false });
    }, 2000);
  }

  onUserSearchInput() {
    this.searchSubject.next(this.userSearchQuery);
    this.showUserSearch = this.userSearchQuery.length >= 2;
  }

  startConvWith(user: any) {
    if (!this.canStartConversation(user)) return;
    const existing = this.conversations.find(c => c.partner?._id === user._id);
    if (existing) { this.selectConversation(existing); }
    else {
      this.selectedConv = { partner: user, lastMessage: null, unreadCount: 0, locked: false, lockAt: null };
      this.messages = [];
      this.selectedConvLocked = false;
      this.selectedConvLockAt = null;
    }
    this.userSearchQuery = '';
    this.userSearchResults = [];
    this.showUserSearch = false;
    this.cdr.markForCheck();
  }

  canStartConversation(user: any): boolean {
    return this.allowedContactIds.has(user?._id);
  }

  lockLabel(lockAt: string | null): string {
    if (!lockAt) return 'Conversation archived and locked';
    return `Conversation archived and locked since ${new Date(lockAt).toLocaleString()}`;
  }

  isMine(msg: Message): boolean {
    const sid = typeof msg.sender_id === 'object' ? (msg.sender_id as any)._id : msg.sender_id;
    return sid === this.auth.currentUser?._id;
  }

  scrollBottom() {
    try { this.msgEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  partnerInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  isImage(url: string | null | undefined) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || url.includes('image');
  }

  trackById(_: number, item: any): string { return item?._id || _; }
  trackByIndex(i: number): number { return i; }
}
