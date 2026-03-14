import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OpportunityService } from '../../../services/opportunity.service';
import { ApplicationService } from '../../../services/application.service';
import { AuthService } from '../../../services/auth.service';
import { SocketService } from '../../../services/socket.service';
import { Opportunity, Application } from '../../../models/models';
import { Subscription } from 'rxjs';
import { BannerService, Banner } from '../../../services/banner.service';

@Component({
  selector: 'app-admin-opportunities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-opportunities.component.html',
})
export class AdminOpportunitiesComponent implements OnInit, OnDestroy {
  // ── Tab control ──
  activeTab: 'list' | 'create' | 'edit' | 'applications' = 'list';

  // ── Opportunity list ──
  opportunities: Opportunity[] = [];
  loading = true;
  currentPage = 1;
  totalPages = 1;
  total = 0;
  filterStatus = '';
  successMsg = '';
  errorMsg = '';

  // ── Create / Edit form ──
  form = this.emptyForm();
  formErrors: string[] = [];
  saving = false;
  editingId: string | null = null;

  // ── Skill input helper ──
  newSkill = '';

  // ── Optional banner upload for opportunity ──
  bannerFile: File | null = null;
  bannerPreview: string | null = null;
  existingBannerId: string | null = null;
  existingBannerUrl: string | null = null;
  bannerMap: Record<string, Banner> = {};

  // ── Application management ──
  selectedOppForApps: Opportunity | null = null;
  applications: Application[] = [];
  appsLoading = false;
  decidingId: string | null = null;

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
    this.loadOpportunities();

    // Real-time: refresh when new applications arrive or opportunities change
    this.subs.push(
      this.socketService.on('application:created').subscribe(() => {
        this.loadOpportunities();
        if (this.selectedOppForApps) this.openApplications(this.selectedOppForApps);
      }),
      this.socketService.on('opportunity:updated').subscribe(() => this.loadOpportunities()),
      this.socketService.on('opportunity:deleted').subscribe(() => this.loadOpportunities()),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  // ─── Opportunity CRUD ─────────────────────────────────────────────────

  loadOpportunities() {
    this.loading = true;
    this.loadBanners();
    this.oppService
      .list({
        page: this.currentPage,
        limit: 12,
        mine: true,
        status: this.filterStatus || undefined,
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
          this.errorMsg = err.error?.message || 'Failed to load';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadOpportunities();
  }

  filterByStatus() {
    this.currentPage = 1;
    this.loadOpportunities();
  }

  openCreate() {
    this.form = this.emptyForm();
    this.editingId = null;
    this.resetBannerState();
    this.formErrors = [];
    this.activeTab = 'create';
  }

  openEdit(opp: Opportunity) {
    this.editingId = opp._id;
    this.form = {
      title: opp.title,
      description: opp.description,
      requiredSkills: [...opp.requiredSkills],
      duration: opp.duration,
      location: opp.location,
      status: opp.status,
    };
    const existing = this.bannerMap[opp._id];
    this.existingBannerId = existing?._id || null;
    this.existingBannerUrl = existing?.imageUrl || null;
    this.bannerFile = null;
    this.bannerPreview = null;
    this.formErrors = [];
    this.activeTab = 'edit';
  }

  saveOpportunity() {
    this.formErrors = [];
    if (!this.form.title.trim()) this.formErrors.push('Title is required');
    if (!this.form.description.trim()) this.formErrors.push('Description is required');
    if (this.form.requiredSkills.length === 0) this.formErrors.push('At least one skill is required');
    if (!this.form.duration.trim()) this.formErrors.push('Duration is required');
    if (!this.form.location.trim()) this.formErrors.push('Location is required');
    if (this.formErrors.length) return;

    this.saving = true;
    const payload = { ...this.form };

    const obs$ = this.editingId
      ? this.oppService.update(this.editingId, payload)
      : this.oppService.create(payload);

    obs$.subscribe({
      next: (saved) => {
        const finalize = (bannerNotice?: string) => {
          this.successMsg = this.editingId ? 'Opportunity updated!' : 'Opportunity created!';
          if (bannerNotice) this.successMsg += ` ${bannerNotice}`;
          this.saving = false;
          this.activeTab = 'list';
          this.resetBannerState();
          this.loadBanners();
          this.loadOpportunities();
          this.cdr.markForCheck();
          setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
        };

        if (!this.bannerFile) {
          finalize();
          return;
        }

        this.upsertBanner(saved)
          .then(() => finalize())
          .catch(() => finalize('(Opportunity saved, but banner upload failed.)'));
      },
      error: (err) => {
        this.formErrors = [err.error?.message || 'Save failed'];
        if (err.error?.details) this.formErrors = err.error.details;
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  deleteOpportunity(opp: Opportunity) {
    if (!confirm(`Delete "${opp.title}"? This is a soft delete.`)) return;
    this.oppService.delete(opp._id).subscribe({
      next: () => {
        this.successMsg = 'Opportunity deleted';
        this.loadOpportunities();
        this.cdr.markForCheck();
        setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Delete failed';
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Skill helpers ────────────────────────────────────────────────────

  addSkill() {
    const s = this.newSkill.trim();
    if (s && !this.form.requiredSkills.includes(s)) {
      this.form.requiredSkills.push(s);
    }
    this.newSkill = '';
  }

  removeSkill(index: number) {
    this.form.requiredSkills.splice(index, 1);
  }

  onSkillKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addSkill();
    }
  }

  // ─── Application management ──────────────────────────────────────────

  openApplications(opp: Opportunity) {
    this.selectedOppForApps = opp;
    this.activeTab = 'applications';
    this.loadApplications(opp._id);
  }

  loadApplications(oppId: string) {
    this.appsLoading = true;
    this.appService.listForOpportunity(oppId, { limit: 50 }).subscribe({
      next: (data) => {
        this.applications = data.applications;
        this.appsLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Failed to load applications';
        this.appsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  decide(app: Application, decision: 'accepted' | 'rejected') {
    this.decidingId = app._id;
    this.appService.decide(app._id, decision).subscribe({
      next: (updated) => {
        // Update in-place
        const idx = this.applications.findIndex((a) => a._id === app._id);
        if (idx > -1) this.applications[idx] = updated;
        this.decidingId = null;
        this.successMsg = `Application ${decision}`;
        this.cdr.markForCheck();
        setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Decision failed';
        this.decidingId = null;
        this.cdr.markForCheck();
      },
    });
  }

  getVolunteerName(app: Application): string {
    const v = app.volunteer_id;
    return typeof v === 'object' && v ? (v as any).name : '';
  }

  getVolunteerEmail(app: Application): string {
    const v = app.volunteer_id;
    return typeof v === 'object' && v ? (v as any).email : '';
  }

  getVolunteerSkills(app: Application): string[] {
    const v = app.volunteer_id;
    return typeof v === 'object' && v ? (v as any).skills || [] : [];
  }

  backToList() {
    this.activeTab = 'list';
    this.editingId = null;
    this.selectedOppForApps = null;
    this.resetBannerState();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private emptyForm() {
    return {
      title: '',
      description: '',
      requiredSkills: [] as string[],
      duration: '',
      location: '',
      status: 'open' as 'open' | 'in-progress' | 'closed',
    };
  }

  onBannerChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.bannerFile = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      this.bannerPreview = e.target?.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(this.bannerFile);
  }

  clearBanner(event?: Event) {
    if (event) event.stopPropagation();
    this.bannerFile = null;
    this.bannerPreview = null;
    this.cdr.markForCheck();
  }

  private resetBannerState() {
    this.bannerFile = null;
    this.bannerPreview = null;
    this.existingBannerId = null;
    this.existingBannerUrl = null;
  }

  private loadBanners() {
    this.bannerService.getAll().subscribe({
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

  private upsertBanner(opp: Opportunity): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.bannerFile) {
        resolve();
        return;
      }

      const createBanner = () => {
        const form = new FormData();
        form.append('title', opp.title);
        form.append('subtitle', `Volunteer opportunity in ${opp.location}`);
        form.append('opportunity_id', opp._id);
        form.append('image', this.bannerFile as Blob);
        this.bannerService.create(form).subscribe({
          next: () => resolve(),
          error: (err) => reject(err),
        });
      };

      if (!this.existingBannerId) {
        createBanner();
        return;
      }

      this.bannerService.delete(this.existingBannerId).subscribe({
        next: () => createBanner(),
        error: (err) => reject(err),
      });
    });
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'open': return 'bg-success';
      case 'in-progress': return 'bg-warning text-dark';
      case 'closed': return 'bg-secondary';
      default: return 'bg-light text-dark';
    }
  }

  appStatusBadge(status: string): string {
    switch (status) {
      case 'pending': return 'bg-warning text-dark';
      case 'accepted': return 'bg-success';
      case 'rejected': return 'bg-danger';
      default: return 'bg-light text-dark';
    }
  }

  trackById(_: number, item: any): string { return item?._id || _; }
}
