import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-reports.component.html',
})
export class AdminReportsComponent implements OnInit {
  activeReport = 'summary';
  loading = false;

  summaryData: any = null;
  usersData: any[] = [];
  pickupsData: any[] = [];
  volunteersData: any[] = [];
  opportunitiesData: any[] = [];
  applicationsData: any[] = [];
  wasteData: any = {};
  logs: any[] = [];
  illegalDumpData: any[] = [];

  usersSearch = '';
  pickupsSearch = '';
  pickupStatusFilter = '';
  pickupTypeFilter = '';
  volunteersSearch = '';
  opportunitiesSearch = '';
  opportunityStatusFilter = '';
  applicationsSearch = '';
  applicationStatusFilter = '';
  illegalDumpSearch = '';
  illegalDumpApprovalFilter = '';

  logsSearch = '';
  logsAction = '';
  logsFrom = '';
  logsTo = '';

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.loadReport('summary'); }

  loadReport(type: string) {
    this.activeReport = type;
    this.loading = true;
    switch (type) {
      case 'summary':
        this.adminService.getSummaryReport().subscribe({ next: d => { this.summaryData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; this.cdr.markForCheck(); } });
        break;
      case 'users':
        this.adminService.getUserReport().subscribe({ next: d => { this.usersData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'opportunities':
        this.adminService.getOpportunityReport().subscribe({ next: d => { this.opportunitiesData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; this.cdr.markForCheck(); } });
        break;
      case 'applications':
        this.adminService.getApplicationReport({
          status: this.applicationStatusFilter || undefined,
          search: this.applicationsSearch || undefined,
        }).subscribe({ next: d => { this.applicationsData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; this.cdr.markForCheck(); } });
        break;
      case 'pickups':
        this.adminService.getPickupReport().subscribe({ next: d => { this.pickupsData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'waste':
        this.adminService.getWasteReport().subscribe({ next: d => { this.wasteData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'volunteers':
        this.adminService.getVolunteerReport().subscribe({ next: d => { this.volunteersData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'logs':
        this.adminService.getLogs({
          limit: 200,
          action: this.logsAction || undefined,
          search: this.logsSearch || undefined,
          from: this.logsFrom || undefined,
          to: this.logsTo || undefined,
        }).subscribe({ next: d => { this.logs = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'illegal-dumps':
        this.adminService.getIllegalDumpReport().subscribe({ next: d => { this.illegalDumpData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
    }
  }

  exportCSV(type: string) {
    let data: any[];
    let headers: string[];
    let filename: string;

    switch (type) {
      case 'users':
        data = this.filteredUsersData.map(u => ({ Name: u.name, Email: u.email, Username: u.username, Role: u.role, Location: u.location || '', Joined: new Date(u.createdAt).toLocaleDateString(), Status: u.isSuspended ? 'Suspended' : 'Active' }));
        headers = ['Name', 'Email', 'Username', 'Role', 'Location', 'Joined', 'Status'];
        filename = 'users_report';
        break;
      case 'pickups':
        data = this.filteredPickupsData.map(p => ({ Title: p.title, User: typeof p.user_id === 'object' ? p.user_id.name : '', WasteType: p.wasteType, Address: p.address, Date: new Date(p.preferredDate).toLocaleDateString(), Status: p.status, Volunteer: p.volunteer_id && typeof p.volunteer_id === 'object' ? p.volunteer_id.name : 'Unassigned' }));
        headers = ['Title', 'User', 'WasteType', 'Address', 'Date', 'Status', 'Volunteer'];
        filename = 'pickups_report';
        break;
      case 'volunteers':
        data = this.filteredVolunteersData.map(v => ({ Name: v.name, Email: v.email, Location: v.location || '', AcceptedPickups: v.acceptedPickups, CompletedPickups: v.completedPickups, TotalCompleted: v.totalPickupsCompleted || 0 }));
        headers = ['Name', 'Email', 'Location', 'AcceptedPickups', 'CompletedPickups', 'TotalCompleted'];
        filename = 'volunteers_report';
        break;
      case 'opportunities':
        data = this.filteredOpportunitiesData.map(o => ({
          Title: o.title,
          Creator: o.ngo_id?.name || o.ngo_id?.username || '',
          Location: o.location,
          Status: o.status,
          TotalApplications: o.applications?.total || 0,
          Accepted: o.applications?.accepted || 0,
          Pending: o.applications?.pending || 0,
          Rejected: o.applications?.rejected || 0,
          CreatedAt: new Date(o.createdAt).toLocaleDateString(),
        }));
        headers = ['Title', 'Creator', 'Location', 'Status', 'TotalApplications', 'Accepted', 'Pending', 'Rejected', 'CreatedAt'];
        filename = 'opportunities_report';
        break;
      case 'applications':
        data = this.filteredApplicationsData.map(a => ({
          Opportunity: a.opportunity_id?.title || '',
          Volunteer: a.volunteer_id?.name || '',
          Email: a.volunteer_id?.email || '',
          Status: a.status,
          OpportunityStatus: a.opportunity_id?.status || '',
          AppliedAt: new Date(a.createdAt).toLocaleDateString(),
        }));
        headers = ['Opportunity', 'Volunteer', 'Email', 'Status', 'OpportunityStatus', 'AppliedAt'];
        filename = 'applications_report';
        break;
      default:
        return;
    }

    const csvContent = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  getUser(p: any): string { return typeof p.user_id === 'object' ? p.user_id.name : ''; }
  getVolunteer(p: any): string { return p.volunteer_id && typeof p.volunteer_id === 'object' ? p.volunteer_id.name : 'Unassigned'; }
  totalWaste(w: any): number { return w?.wasteByType?.reduce((a: number, b: any) => a + b.count, 0) || 0; }
  totalPointsForDump(item: any): number {
    return (item?.pointTransactions || []).reduce((sum: number, tx: any) => sum + (tx.points || 0), 0);
  }
  txUserName(tx: any): string {
    return tx?.user_id?.name || tx?.user_id?.username || 'Unknown';
  }
  performedByName(log: any): string {
    return log?.performedBy?.name || log?.performedBy?.username || '-';
  }

  get filteredUsersData(): any[] {
    const q = this.usersSearch.trim().toLowerCase();
    if (!q) return this.usersData;
    return this.usersData.filter((u) =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (u.location || '').toLowerCase().includes(q)
    );
  }

  get filteredPickupsData(): any[] {
    const q = this.pickupsSearch.trim().toLowerCase();
    return this.pickupsData.filter((p) => {
      const textOk = !q ||
        (p.title || '').toLowerCase().includes(q) ||
        this.getUser(p).toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q);
      const statusOk = !this.pickupStatusFilter || p.status === this.pickupStatusFilter;
      const typeVal = p.requestType || 'Pickup';
      const typeOk = !this.pickupTypeFilter || typeVal === this.pickupTypeFilter;
      return textOk && statusOk && typeOk;
    });
  }

  get filteredVolunteersData(): any[] {
    const q = this.volunteersSearch.trim().toLowerCase();
    if (!q) return this.volunteersData;
    return this.volunteersData.filter((v) =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.email || '').toLowerCase().includes(q) ||
      (v.location || '').toLowerCase().includes(q)
    );
  }

  get filteredOpportunitiesData(): any[] {
    const q = this.opportunitiesSearch.trim().toLowerCase();
    return this.opportunitiesData.filter((o) => {
      const textOk = !q ||
        (o.title || '').toLowerCase().includes(q) ||
        (o.location || '').toLowerCase().includes(q) ||
        (o.ngo_id?.name || '').toLowerCase().includes(q);
      const statusOk = !this.opportunityStatusFilter || o.status === this.opportunityStatusFilter;
      return textOk && statusOk;
    });
  }

  get filteredApplicationsData(): any[] {
    const q = this.applicationsSearch.trim().toLowerCase();
    return this.applicationsData.filter((a) => {
      const textOk = !q ||
        (a.opportunity_id?.title || '').toLowerCase().includes(q) ||
        (a.volunteer_id?.name || '').toLowerCase().includes(q) ||
        (a.volunteer_id?.email || '').toLowerCase().includes(q);
      const statusOk = !this.applicationStatusFilter || a.status === this.applicationStatusFilter;
      return textOk && statusOk;
    });
  }

  applyApplicationFilters() {
    this.loadReport('applications');
  }

  get filteredIllegalDumpData(): any[] {
    const q = this.illegalDumpSearch.trim().toLowerCase();
    return this.illegalDumpData.filter((d) => {
      const textOk = !q ||
        (d.title || '').toLowerCase().includes(q) ||
        (d.address || '').toLowerCase().includes(q) ||
        (d.user_id?.name || '').toLowerCase().includes(q) ||
        (d.volunteer_id?.name || '').toLowerCase().includes(q);
      const approvalOk = !this.illegalDumpApprovalFilter || (d.adminApprovalStatus || 'not-required') === this.illegalDumpApprovalFilter;
      return textOk && approvalOk;
    });
  }

  applyLogFilters() {
    this.loadReport('logs');
  }

  clearLogFilters() {
    this.logsSearch = '';
    this.logsAction = '';
    this.logsFrom = '';
    this.logsTo = '';
    this.loadReport('logs');
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}