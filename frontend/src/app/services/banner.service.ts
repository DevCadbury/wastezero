import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Banner {
  _id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  opportunity_id: { _id: string; title: string } | null;
  isActive: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class BannerService {
  private api = `${environment.apiUrl}/banners`;

  constructor(private http: HttpClient) {}

  getActive(): Observable<Banner[]> {
    return this.http.get<Banner[]>(this.api);
  }

  getAll(): Observable<Banner[]> {
    return this.http.get<Banner[]>(`${this.api}/all`);
  }

  create(form: FormData): Observable<Banner> {
    return this.http.post<Banner>(this.api, form);
  }

  toggle(id: string): Observable<Banner> {
    return this.http.put<Banner>(`${this.api}/${id}/toggle`, {});
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.api}/${id}`);
  }
}
