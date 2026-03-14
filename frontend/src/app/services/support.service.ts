import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TicketReply {
  _id: string;
  author_id: { _id: string; name: string; username: string; role: string };
  authorRole: string;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  user_id: { _id: string; name: string; username: string; role: string; email: string } | string;
  role: string;
  category: string;
  subject: string;
  description: string;
  mediaUrl: string | null;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  adminResponse: string;
  replies: TicketReply[];
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SupportService {
  private api = `${environment.apiUrl}/support`;

  constructor(private http: HttpClient) {}

  createTicket(form: FormData): Observable<SupportTicket> {
    return this.http.post<SupportTicket>(this.api, form);
  }

  myTickets(): Observable<SupportTicket[]> {
    return this.http.get<SupportTicket[]>(`${this.api}/my`);
  }

  getTicket(id: string): Observable<SupportTicket> {
    return this.http.get<SupportTicket>(`${this.api}/${id}`);
  }

  allTickets(params: { status?: string; page?: number; limit?: number } = {}): Observable<{ tickets: SupportTicket[]; total: number; page: number }> {
    let p = new HttpParams();
    if (params.status) p = p.set('status', params.status);
    if (params.page) p = p.set('page', String(params.page));
    if (params.limit) p = p.set('limit', String(params.limit));
    return this.http.get<{ tickets: SupportTicket[]; total: number; page: number }>(this.api, { params: p });
  }

  updateStatus(id: string, status: string, adminResponse?: string): Observable<SupportTicket> {
    return this.http.put<SupportTicket>(`${this.api}/${id}/status`, { status, adminResponse });
  }

  addReply(id: string, form: FormData): Observable<TicketReply> {
    return this.http.post<TicketReply>(`${this.api}/${id}/reply`, form);
  }
}
