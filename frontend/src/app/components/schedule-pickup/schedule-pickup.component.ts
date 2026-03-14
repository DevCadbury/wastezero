import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PickupService } from '../../services/pickup.service';
import { UploadService } from '../../services/upload.service';

@Component({
  selector: 'app-schedule-pickup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedule-pickup.component.html',
})
export class SchedulePickupComponent {
  loading = false;
  uploading = false;
  successMsg = '';
  errorMsg = '';

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
  filePreview: string | null = null;

  wasteTypes = ['Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'];

  constructor(
    private pickupService: PickupService,
    private uploadService: UploadService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

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

  onSubmit() {
    this.errorMsg = '';
    this.successMsg = '';
    const { title, wasteType, estimatedQuantity, address, preferredDate, preferredTime } = this.form;
    if (!title || !wasteType || !estimatedQuantity || !address || !preferredDate || !preferredTime) {
      this.errorMsg = 'Please fill all required fields.';
      return;
    }
    this.loading = true;

    const doCreate = () => {
      this.pickupService.createPickup(this.form).subscribe({
        next: () => {
          this.loading = false;
          this.successMsg = 'Pickup scheduled! Volunteers will be notified.';
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

    if (this.selectedFile) {
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
    this.selectedFile = null;
    this.filePreview = null;
    this.errorMsg = '';
    this.successMsg = '';
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}