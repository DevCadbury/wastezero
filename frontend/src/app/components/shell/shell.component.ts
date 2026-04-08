import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { NotificationService, Notification } from '../../services/notification.service';
import { SearchService, SearchResult } from '../../services/search.service';
import { SocketService } from '../../services/socket.service';
import { UserService } from '../../services/user.service';
import { PointHistoryItem, User } from '../../models/models';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  user: User | null = null;
  currentRoute = '';
  darkMode = false;
  sidebarOpen = false;

  // Notifications
  notifications: Notification[] = [];
  unreadCount = 0;
  showNotifDropdown = false;
  notificationFilter: 'all' | 'alerts' | 'messages' = 'all';
  showSystemAlertDialog = false;
  activeSystemAlert: Notification | null = null;
  systemAlertsEnabled = true;
  private pendingSystemAlerts: Notification[] = [];
  private readonly systemAlertAckPrefix = 'wz-system-alert-ack';

  // Points
  showPointsDropdown = false;
  pointsHistory: PointHistoryItem[] = [];
  pointsHistoryLoading = false;

  // Search
  searchQuery = '';
  searchResults: SearchResult[] = [];
  showSearchResults = false;
  searchLoading = false;

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private notifService: NotificationService,
    private searchService: SearchService,
    private socketService: SocketService,
    private userService: UserService,
  ) {
    this.darkMode = localStorage.getItem('wz-dark') === '1';
    document.body.classList.toggle('dark-mode', this.darkMode);
  }

  ngOnInit() {
    this.subs.push(
      this.auth.currentUser$.subscribe((u) => {
        this.user = u;
        if (u) {
          this.systemAlertsEnabled = this.readSystemAlertSetting(u._id);
          this.notifService.loadNotifications({ limit: 15 }).subscribe();
          this.notifService.loadUnreadCount().subscribe();
        } else {
          this.systemAlertsEnabled = true;
          this.showSystemAlertDialog = false;
          this.activeSystemAlert = null;
          this.pendingSystemAlerts = [];
        }
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
        this.currentRoute = e.urlAfterRedirects;
        this.showSearchResults = false;
        this.showNotifDropdown = false;
        this.sidebarOpen = false; // close drawer on navigation
        this.cdr.markForCheck();
      }),
    );
    this.currentRoute = this.router.url;

    // Subscribe to notification updates
    this.subs.push(
      this.notifService.notifications$.subscribe((n) => {
        this.notifications = n;
        this.syncSystemAlertsFromList(n);
        this.cdr.markForCheck();
      }),
    );
    this.subs.push(
      this.notifService.unreadCount$.subscribe((c) => {
        this.unreadCount = c;
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.socketService.on<Notification>('notification:new').subscribe((notif) => {
        if (!this.isBroadcastAlertNotification(notif)) return;
        this.queueSystemAlert(notif);
      }),
    );

    // Subscribe to search results
    this.subs.push(
      this.searchService.searchResults$.subscribe((res) => {
        this.searchResults = res.results;
        this.showSearchResults = res.results.length > 0 || res.q.length >= 2;
        this.searchLoading = false;
        this.cdr.markForCheck();
      }),
      this.socketService.on('points:updated').subscribe(() => {
        this.userService.getProfile().subscribe({
          next: (profile) => {
            this.auth.updateCurrentUser(profile);
            this.cdr.markForCheck();
          },
          error: () => {},
        });
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  get initials(): string {
    return this.user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  get alertNotifications(): Notification[] {
    return this.notifications.filter((n) => this.isBroadcastAlertNotification(n));
  }

  get alertUnreadCount(): number {
    return this.alertNotifications.filter((n) => !n.isRead).length;
  }

  get messageNotifications(): Notification[] {
    return this.notifications.filter((n) => n.type.includes('chat') || n.ref_model === 'Message');
  }

  get filteredNotifications(): Notification[] {
    if (this.notificationFilter === 'alerts') return this.alertNotifications;
    if (this.notificationFilter === 'messages') return this.messageNotifications;
    return this.notifications;
  }

  get filteredUnreadCount(): number {
    if (this.notificationFilter === 'alerts') return this.alertUnreadCount;
    if (this.notificationFilter === 'messages') return this.messageNotifications.filter((n) => !n.isRead).length;
    return this.unreadCount;
  }

  logout() {
    this.auth.logout();
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    this.cdr.markForCheck();
  }

  closeSidebar() {
    this.sidebarOpen = false;
    this.cdr.markForCheck();
  }

  isActive(route: string): boolean {
    return this.currentRoute.startsWith(route);
  }

  isIllegalDumpRoute(): boolean {
    return this.currentRoute.startsWith('/schedule-pickup') && this.currentRoute.includes('mode=illegal-dump');
  }

  toggleDark() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
    localStorage.setItem('wz-dark', this.darkMode ? '1' : '0');
    this.cdr.markForCheck();
  }

  // ── Notifications ───────────────────────────────────────────────────────
  toggleNotifDropdown(event: Event) {
    event.stopPropagation();
    this.showNotifDropdown = !this.showNotifDropdown;
    this.showPointsDropdown = false;
    this.showSearchResults = false;
    if (this.showNotifDropdown) {
      this.notificationFilter = 'all';
      this.notifService.loadNotifications({ limit: 15 }).subscribe();
    }
    this.cdr.markForCheck();
  }

  markNotifRead(notif: Notification) {
    if (!notif.isRead) {
      this.notifService.markAsRead(notif._id).subscribe();
    }

    if (this.isBroadcastAlertNotification(notif)) {
      this.openSystemAlertDialog(notif);
      this.showNotifDropdown = false;
      this.cdr.markForCheck();
      return;
    }

    // Navigate based on type
    if (notif.ref_model === 'Application') {
      if (this.user?.role === 'admin') {
        this.router.navigate(['/admin/opportunities']);
      } else {
        this.router.navigate(['/my-applications']);
      }
    } else if (notif.ref_model === 'Opportunity') {
      this.router.navigate(['/opportunities']);
    } else if (notif.ref_model === 'Message') {
      if (notif.ref_id) {
        this.router.navigate(['/messages'], { queryParams: { message: notif.ref_id } });
      } else {
        this.router.navigate(['/messages']);
      }
    }
    this.showNotifDropdown = false;
    this.cdr.markForCheck();
  }

  markAllRead() {
    this.notifService.markAllAsRead().subscribe();
  }

  toggleSystemAlertSetting(enabled: boolean) {
    this.systemAlertsEnabled = !!enabled;
    this.writeSystemAlertSetting(this.systemAlertsEnabled);
    if (!this.systemAlertsEnabled) {
      this.showSystemAlertDialog = false;
      this.activeSystemAlert = null;
      this.pendingSystemAlerts = [];
    }
    this.cdr.markForCheck();
  }

  closeSystemAlertDialog() {
    if (this.activeSystemAlert) {
      this.acknowledgeSystemAlert(this.activeSystemAlert);
    }

    this.showSystemAlertDialog = false;
    this.activeSystemAlert = null;

    while (this.pendingSystemAlerts.length) {
      const next = this.pendingSystemAlerts.shift() as Notification;
      if (!this.isSystemAlertAcknowledged(next)) {
        this.openSystemAlertDialog(next);
        break;
      }
    }

    this.cdr.markForCheck();
  }

  confirmSystemAlert() {
    this.closeSystemAlertDialog();
  }

  // ── Points ──────────────────────────────────────────────────────────────
  togglePointsDropdown(event: Event) {
    event.stopPropagation();
    this.showPointsDropdown = !this.showPointsDropdown;
    this.showNotifDropdown = false;
    this.showSearchResults = false;

    if (this.showPointsDropdown) {
      this.loadPointsHistoryPreview();
    }
    this.cdr.markForCheck();
  }

  loadPointsHistoryPreview() {
    this.pointsHistoryLoading = true;
    this.userService.getPointsHistory({ page: 1, limit: 6 }).subscribe({
      next: (res) => {
        this.pointsHistory = res.items || [];
        this.pointsHistoryLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.pointsHistory = [];
        this.pointsHistoryLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  openPointsPage() {
    this.showPointsDropdown = false;
    this.router.navigate(['/my-points']);
  }

  formatPoints(points: number): string {
    if (points > 0) return `+${points}`;
    return `${points}`;
  }

  pointsClass(points: number): string {
    return points >= 0 ? 'text-success' : 'text-danger';
  }

  // ── Search ──────────────────────────────────────────────────────────────
  onSearchInput() {
    this.showNotifDropdown = false;
    if (this.searchQuery.trim().length >= 2) {
      this.searchLoading = true;
      this.searchService.searchDebounced(this.searchQuery.trim());
    } else {
      this.searchResults = [];
      this.showSearchResults = false;
    }
    this.cdr.markForCheck();
  }

  navigateToResult(result: SearchResult) {
    switch (result._type) {
      case 'opportunity':
        if (this.user?.role === 'admin') {
          this.router.navigate(['/admin/opportunities']);
        } else {
          this.router.navigate(['/opportunities']);
        }
        break;
      case 'pickup':
        this.router.navigate(['/my-pickups']);
        break;
      case 'user':
        this.router.navigate(['/admin/users']);
        break;
    }
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchResults = false;
    this.cdr.markForCheck();
  }

  getResultIcon(type: string): string {
    switch (type) {
      case 'opportunity': return 'bi-briefcase';
      case 'pickup': return 'bi-truck';
      case 'user': return 'bi-person';
      default: return 'bi-search';
    }
  }

  getResultTitle(result: SearchResult): string {
    return result.title || result.name || 'Untitled';
  }

  getResultSubtitle(result: SearchResult): string {
    if (result._type === 'opportunity') return result.location || '';
    if (result._type === 'pickup') return result.address || '';
    if (result._type === 'user') return result.role || '';
    return '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    this.showNotifDropdown = false;
    this.showPointsDropdown = false;
    this.showSearchResults = false;
    this.cdr.markForCheck();
  }

  private queueSystemAlert(notif: Notification) {
    if (!notif?._id || this.isSystemAlertAcknowledged(notif)) {
      return;
    }

    if (!this.systemAlertsEnabled) {
      return;
    }

    if (this.showSystemAlertDialog) {
      const exists = this.pendingSystemAlerts.some((n) => n._id === notif._id);
      if (!exists) {
        this.pendingSystemAlerts.push(notif);
      }
      return;
    }

    this.openSystemAlertDialog(notif);
    this.cdr.markForCheck();
  }

  private syncSystemAlertsFromList(list: Notification[]) {
    if (!Array.isArray(list) || !list.length) return;
    if (!this.systemAlertsEnabled) return;

    // On login/load we only auto-open the newest pending broadcast alert.
    const latestPending = list.find((notif) => {
      if (!this.isBroadcastAlertNotification(notif) || !notif?._id) return false;
      if (this.isSystemAlertAcknowledged(notif)) return false;
      const isActive = this.activeSystemAlert?._id === notif._id;
      const isPending = this.pendingSystemAlerts.some((n) => n._id === notif._id);
      return !isActive && !isPending;
    });

    if (!latestPending) return;

    if (!this.showSystemAlertDialog) {
      this.openSystemAlertDialog(latestPending);
      return;
    }

    this.pendingSystemAlerts.push(latestPending);
  }

  private openSystemAlertDialog(notif: Notification) {
    this.activeSystemAlert = notif;
    this.showSystemAlertDialog = true;
  }

  private getSystemAlertAckKey(notif: Notification): string {
    const userId = this.user?._id || 'anonymous';
    return `${this.systemAlertAckPrefix}:${userId}:${notif._id}`;
  }

  private isSystemAlertAcknowledged(notif: Notification): boolean {
    try {
      return localStorage.getItem(this.getSystemAlertAckKey(notif)) === '1';
    } catch {
      return false;
    }
  }

  private acknowledgeSystemAlert(notif: Notification) {
    try {
      localStorage.setItem(this.getSystemAlertAckKey(notif), '1');
    } catch {
      // Ignore storage failures; notification remains available from dropdown.
    }
  }

  private isBroadcastAlertNotification(notif: Notification | null | undefined): boolean {
    if (!notif) return false;
    // Keep support for old stored alerts created before type was changed.
    return notif.type === 'system:alert' || notif.type === 'system';
  }

  private systemAlertSettingKey(userId: string): string {
    return `wz-system-alert-enabled:${userId}`;
  }

  private readSystemAlertSetting(userId: string): boolean {
    try {
      const raw = localStorage.getItem(this.systemAlertSettingKey(userId));
      if (raw === null) return true;
      return raw === '1';
    } catch {
      return true;
    }
  }

  private writeSystemAlertSetting(enabled: boolean) {
    const userId = this.user?._id;
    if (!userId) return;
    try {
      localStorage.setItem(this.systemAlertSettingKey(userId), enabled ? '1' : '0');
    } catch {
      // Ignore storage write failures.
    }
  }
}
