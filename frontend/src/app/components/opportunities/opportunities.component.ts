import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { OpportunityService } from '../../services/opportunity.service';
import { ApplicationService } from '../../services/application.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { Opportunity, Application, MatchedOpportunity } from '../../models/models';
import { Subscription } from 'rxjs';
import { BannerService, Banner } from '../../services/banner.service';

@Component({
  selector: 'app-opportunities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './opportunities.component.html',
})
export class OpportunitiesComponent implements OnInit, OnDestroy {
  opportunities: Opportunity[] = [];
  matchedOpportunities: MatchedOpportunity[] = [];
  myApplications: Map<string, Application> = new Map();
  loading = true;
  loadingMatches = false;
  successMsg = '';
  errorMsg = '';
  matchErrorMsg = '';

  filterLocation = '';
  filterSkills = '';

  currentPage = 1;
  totalPages = 1;
  total = 0;

  selectedOpp: Opportunity | null = null;
  applyingId: string | null = null;
  bannerMap: Record<string, Banner> = {};

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private oppService: OpportunityService,
    private appService: ApplicationService,
    private bannerService: BannerService,
    private socketService: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadBanners();
    this.load();
    if (this.auth.userRole === 'volunteer') {
      this.loadMyApplications();
      this.loadMatches();
    }

    // Real-time: refresh on opportunity changes
    this.subs.push(
      this.socketService.on('opportunity:created').subscribe(() => this.load()),
      this.socketService.on('opportunity:updated').subscribe(() => this.load()),
      this.socketService.on('opportunity:deleted').subscribe(() => this.load()),
      // Refresh application status when decision arrives
      this.socketService.on('application:updated').subscribe(() => {
        this.loadMyApplications();
        this.loadMatches();
      }),
      this.socketService.on('opportunity:match').subscribe(() => this.loadMatches()),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  load() {
    this.loading = true;
    this.errorMsg = '';
    this.loadBanners();
    this.oppService
      .list({
        page: this.currentPage,
        limit: 12,
        location: this.filterLocation || undefined,
        skills: this.filterSkills || undefined,
      })
      .subscribe({
        next: (data) => {
          this.opportunities = data.opportunities;
          this.totalPages = data.pages;
          this.total = data.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Failed to load opportunities';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadMatches() {
    if (this.auth.userRole !== 'volunteer') return;

    this.loadingMatches = true;
    this.matchErrorMsg = '';

    this.oppService.listMatches({ page: 1, limit: 6 }).subscribe({
      next: (data) => {
        this.matchedOpportunities = data.opportunities || [];
        this.loadingMatches = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.matchErrorMsg = err.error?.message || 'Failed to load recommendations';
        this.matchedOpportunities = [];
        this.loadingMatches = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadBanners() {
    this.bannerService.getActive().subscribe({
      next: (banners) => {
        const nextMap: Record<string, Banner> = {};
        (banners || []).forEach((b) => {
          const oppRef: any = b.opportunity_id as any;
          const oppId = typeof oppRef === 'string' ? oppRef : oppRef?._id;
          if (oppId) nextMap[oppId] = b;
        });
        this.bannerMap = nextMap;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  getBannerUrl(oppId: string): string | null {
    return this.bannerMap[oppId]?.imageUrl || null;
  }

  loadMyApplications() {
    this.appService.getMyApplications({ limit: 50 }).subscribe({
      next: (data) => {
        this.myApplications.clear();
        for (const app of data.applications) {
          const oppId = typeof app.opportunity_id === 'string'
            ? app.opportunity_id
            : (app.opportunity_id as Opportunity)?._id;
          if (oppId) this.myApplications.set(oppId, app);
        }
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  applyFilter() {
    this.currentPage = 1;
    this.load();
  }

  clearFilters() {
    this.filterLocation = '';
    this.filterSkills = '';
    this.currentPage = 1;
    this.load();
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.load();
  }

  apply(oppId: string) {
    this.applyingId = oppId;
    this.errorMsg = '';
    this.successMsg = '';
    this.appService.apply(oppId).subscribe({
      next: (app) => {
        this.successMsg = 'Application submitted successfully!';
        this.myApplications.set(oppId, app);
        this.matchedOpportunities = this.matchedOpportunities.filter((o) => o._id !== oppId);
        this.applyingId = null;
        this.cdr.markForCheck();
        setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Failed to apply';
        this.applyingId = null;
        this.cdr.markForCheck();
      },
    });
  }

  hasApplied(oppId: string): boolean {
    return this.myApplications.has(oppId);
  }

  getApplicationStatus(oppId: string): string {
    return this.myApplications.get(oppId)?.status || '';
  }

  scoreClass(score: number): string {
    if (score >= 75) return 'bg-success text-white';
    if (score >= 45) return 'bg-warning text-dark';
    return 'bg-secondary text-white';
  }

  openDetail(opp: Opportunity) { this.selectedOpp = opp; }
  closeDetail() { this.selectedOpp = null; }

  getNgoName(opp: Opportunity): string {
    if (typeof opp.ngo_id === 'object' && opp.ngo_id) {
      return (opp.ngo_id as any).name || '';
    }
    return '';
  }

  trackById(_: number, item: any): string { return item?._id || _; }
  trackByIndex(index: number): number { return index; }
}