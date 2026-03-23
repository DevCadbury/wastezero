import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { PointHistoryItem } from '../../models/models';

@Component({
  selector: 'app-my-points',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './my-points.component.html',
})
export class MyPointsComponent implements OnInit {
  loading = true;
  errorMsg = '';
  rewardPoints = 0;
  totalPointsEarned = 0;

  items: PointHistoryItem[] = [];
  page = 1;
  pages = 1;
  total = 0;

  constructor(
    private auth: AuthService,
    private router: Router,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    if (this.auth.userRole === 'admin') {
      this.router.navigate(['/admin/panel']);
      return;
    }
    this.loadSummary();
    this.loadHistory(1);
  }

  loadSummary() {
    this.userService.getPointsSummary().subscribe({
      next: (res) => {
        this.rewardPoints = res.rewardPoints || 0;
        this.totalPointsEarned = res.totalPointsEarned || 0;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  loadHistory(page: number) {
    this.loading = true;
    this.errorMsg = '';
    this.userService.getPointsHistory({ page, limit: 20 }).subscribe({
      next: (res) => {
        this.items = res.items || [];
        this.page = res.page || 1;
        this.pages = res.pages || 1;
        this.total = res.total || 0;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Failed to load points history';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.pages) return;
    this.loadHistory(page);
  }

  itemTitle(item: PointHistoryItem): string {
    if (item.pickup_id && typeof item.pickup_id === 'object') {
      return item.pickup_id.title || item.reason;
    }
    return item.reason;
  }

  sourceBadgeClass(source: string): string {
    if (source === 'illegal-dump') return 'bg-danger-subtle text-danger border';
    if (source === 'pickup') return 'bg-success-subtle text-success border';
    return 'bg-light text-dark border';
  }

  formatPoints(points: number): string {
    if (points > 0) return `+${points}`;
    return `${points}`;
  }

  pointsClass(points: number): string {
    return points >= 0 ? 'text-success' : 'text-danger';
  }

  trackById(_: number, item: PointHistoryItem): string {
    return item._id;
  }
}
