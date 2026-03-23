import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { PickupService } from '../../services/pickup.service';
import { UploadService } from '../../services/upload.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-schedule-pickup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './schedule-pickup.component.html',
})
export class SchedulePickupComponent implements OnInit, OnDestroy {
  private pickupService = inject(PickupService);
  private uploadService = inject(UploadService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  uploading = false;
  successMsg = '';
  errorMsg = '';
  requestType: 'Pickup' | 'IllegalDump' = 'Pickup';

  form = {
    title: '',
    wasteType: '',
    description: '',
    estimatedQuantity: '',
    address: '',
    preferredDate: '',
    preferredTime: '',
    contactDetails: '',
    mediaUrl: '',
  };

  selectedFile: File | null = null;
  selectedFiles: File[] = [];
  filePreview: string | null = null;
  filePreviews: string[] = [];

  wasteTypes = ['Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'];
  private navSub?: Subscription;

  ngOnInit() {
    this.applyModeFromUrl();

    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.applyModeFromUrl();
      }
    });
  }

  ngOnDestroy() {
    this.navSub?.unsubscribe();
  }

  private applyModeFromUrl() {
    const queryString = this.router.url.includes('?')
      ? this.router.url.split('?')[1]
      : '';
    const params = new URLSearchParams(queryString);
    const mode = (params.get('mode') || '').toLowerCase();
    if (mode === 'illegal-dump') {
      this.setRequestType('IllegalDump');
    } else {
      this.setRequestType('Pickup');
    }
  }

  onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      if (this.requestType === 'IllegalDump') {
        const list = Array.from(input.files).slice(0, 5);
        this.selectedFiles = list;
        this.filePreviews = [];
        list.forEach((f) => {
          if (!f.type.startsWith('image/')) return;
          const reader = new FileReader();
          reader.onload = (r) => {
            const data = r.target?.result as string;
            if (data) {
              this.filePreviews = [...this.filePreviews, data];
              this.cdr.markForCheck();
            }
          };
          reader.readAsDataURL(f);
        });
        this.cdr.markForCheck();
        return;
      }

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

  onSubmit() {
    this.errorMsg = '';
    this.successMsg = '';
    const { title, wasteType, estimatedQuantity, address, preferredDate, preferredTime } = this.form;
    if (!title || !wasteType || !estimatedQuantity || !address || !preferredDate || !preferredTime) {
      this.errorMsg = 'Please fill all required fields.';
      return;
    }

    if (this.requestType === 'IllegalDump' && this.selectedFiles.length === 0 && !this.form.mediaUrl) {
      this.errorMsg = 'Please attach at least one photo for illegal dump reporting.';
      return;
    }

    this.loading = true;

    const doCreate = () => {
      const payload: any = {
        ...this.form,
        requestType: this.requestType,
      };

      this.pickupService.createPickup(payload).subscribe({
        next: () => {
          this.loading = false;
          this.successMsg =
            this.requestType === 'IllegalDump'
              ? 'Illegal dump reported! Volunteers and admins have been informed.'
              : 'Pickup scheduled! Volunteers will be notified.';
          this.cdr.markForCheck();
          setTimeout(() => this.router.navigate(['/my-pickups']), 1500);
        },
        error: (err) => {
          this.loading = false;
          this.errorMsg = err.error?.message || 'Failed to schedule pickup.';
          this.cdr.markForCheck();
        },
      });
    };

    if (this.requestType === 'IllegalDump' && this.selectedFiles.length > 0) {
      this.uploading = true;
      this.uploadService.uploadMultiple(this.selectedFiles, 'illegal-dumps').subscribe({
        next: (results) => {
          const urls = (results || []).map((r) => r.url).filter(Boolean);
          this.form.mediaUrl = urls[0] || '';
          (this.form as any).reportImages = urls;
          this.uploading = false;
          doCreate();
        },
        error: () => {
          this.uploading = false;
          this.errorMsg = 'Image upload failed. Please try again.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
    } else if (this.selectedFile) {
      this.uploading = true;
      this.uploadService.uploadSingle(this.selectedFile, 'pickups').subscribe({
        next: (res) => { this.form.mediaUrl = res.url; this.uploading = false; doCreate(); },
        error: () => { this.uploading = false; doCreate(); /* continue without media */ },
      });
    } else {
      doCreate();
    }
  }

  reset() {
    this.form = { title: '', wasteType: '', description: '', estimatedQuantity: '', address: '', preferredDate: '', preferredTime: '', contactDetails: '', mediaUrl: '' };
    this.requestType = 'Pickup';
    this.selectedFile = null;
    this.selectedFiles = [];
    this.filePreview = null;
    this.filePreviews = [];
    this.errorMsg = '';
    this.successMsg = '';
  }

  setRequestType(type: 'Pickup' | 'IllegalDump') {
    this.requestType = type;
    this.selectedFile = null;
    this.filePreview = null;
    this.selectedFiles = [];
    this.filePreviews = [];
    this.form.mediaUrl = '';
    this.cdr.markForCheck();
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}