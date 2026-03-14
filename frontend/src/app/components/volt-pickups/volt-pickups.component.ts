import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PickupService } from '../../services/pickup.service';
import { SocketService } from '../../services/socket.service';
import { Pickup } from '../../models/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-volt-pickups',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './volt-pickups.component.html',
})
export class VoltPickupsComponent implements OnInit, OnDestroy {
  pickups: Pickup[] = [];
  filtered: Pickup[] = [];
  loading = true;
  error = '';
  toast = '';
  actionLoading = '';

  filterLocation = '';
  filterWaste = '';
  activeFilter: 'open' | 'mine' = 'open';

  wasteTypes = ['', 'Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'];
  private subs: Subscription[] = [];

  constructor(
    private pickupService: PickupService,
    private socket: SocketService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();
    this.subs.push(
      this.socket.on<Pickup>('pickup:created').subscribe(() => this.load()),
      this.socket.on<any>('pickup:updated').subscribe(() => this.load()),
    );
  }

  ngOnDestroy() { this.subs.forEach(s => s.unsubscribe()); }

  load() {
    this.loading = true;
    const obs = this.activeFilter === 'open'
      ? this.pickupService.getOpportunities()
      : this.pickupService.getMyPickups();
    obs.subscribe({
      next: (data) => {
        this.pickups = Array.isArray(data) ? data : (data.pickups || []);
        this.applyFilters();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.error = 'Failed to load pickups'; this.cdr.markForCheck(); },
    });
  }

  applyFilters() {
    let result = this.pickups;
    if (this.filterLocation.trim()) {
      const q = this.filterLocation.toLowerCase();
      result = result.filter(p => p.address?.toLowerCase().includes(q));
    }
    if (this.filterWaste) {
      result = result.filter(p => p.wasteType === this.filterWaste);
    }
    this.filtered = result;
  }

  onFilterChange() { this.applyFilters(); this.cdr.markForCheck(); }

  setTab(tab: 'open' | 'mine') { this.activeFilter = tab; this.load(); }

  accept(p: Pickup) {
    this.actionLoading = p._id;
    this.pickupService.acceptPickup(p._id).subscribe({
      next: () => {
        this.showToast('Pickup accepted! Coordinate with the user.');
        this.load();
        this.actionLoading = '';
      },
      error: (err) => { this.actionLoading = ''; this.showToast(err?.error?.message || 'Failed to accept'); this.cdr.markForCheck(); },
    });
  }

  complete(p: Pickup) {
    this.actionLoading = p._id;
    this.pickupService.completePickup(p._id).subscribe({
      next: () => { this.showToast('Pickup marked as completed!'); this.load(); this.actionLoading = ''; },
      error: () => { this.actionLoading = ''; this.cdr.markForCheck(); },
    });
  }

  contactUser(p: Pickup) {
    const userId = typeof p.user_id === 'object' ? (p.user_id as any)._id : p.user_id;
    this.router.navigate(['/messages'], { queryParams: { user: userId } });
  }

  showToast(msg: string) {
    this.toast = msg;
    this.cdr.markForCheck();
    setTimeout(() => { this.toast = ''; this.cdr.markForCheck(); }, 3500);
  }

  getUserName(p: Pickup): string {
    return typeof p.user_id === 'object' ? (p.user_id as any).name || 'Unknown' : 'User';
  }

  isImage(url: string | null | undefined) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  }
}
