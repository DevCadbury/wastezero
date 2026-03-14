import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UploadResult {
  url: string;
  originalName: string;
  mimetype: string;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private api = `${environment.apiUrl}/upload`;

  constructor(private http: HttpClient) {}

  uploadSingle(file: File, folder = 'general'): Observable<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    return this.http.post<UploadResult>(`${this.api}/single`, form);
  }

  uploadMultiple(files: File[], folder = 'general'): Observable<UploadResult[]> {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    form.append('folder', folder);
    return this.http.post<UploadResult[]>(`${this.api}/multiple`, form);
  }
}
