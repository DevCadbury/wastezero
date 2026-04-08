import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Message } from '../models/models';

export interface ConversationLockMeta {
  locked: boolean;
  pickup_id: string | null;
  lockAt: string | null;
  status: string | null;
  lockReason?: string | null;
}

export interface MessageThreadResponse extends ConversationLockMeta {
  messages: Message[];
  partner?: any;
  hasMore?: boolean;
  oldestCursor?: string | null;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  sendMessage(data: FormData | { receiver_id: string; content: string; pickup_id?: string }): Observable<Message> {
    if (data instanceof FormData) {
      return this.http.post<Message>(`${this.apiUrl}/messages`, data);
    }
    return this.http.post<Message>(`${this.apiUrl}/messages`, data);
  }

  getConversations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/messages/conversations`);
  }

  getMessages(userId: string, limit = 40, before?: string): Observable<MessageThreadResponse> {
    let params = new HttpParams().set('limit', String(limit));
    if (before) params = params.set('before', before);
    return this.http.get<MessageThreadResponse>(`${this.apiUrl}/messages/${userId}`, { params });
  }

  reactToMessage(messageId: string, emoji: string): Observable<{ messageId: string; reactions: any[] }> {
    return this.http.post<{ messageId: string; reactions: any[] }>(`${this.apiUrl}/messages/${messageId}/reaction`, { emoji });
  }

  reportMessage(messageId: string, reason: string, details?: string): Observable<{ message: string; ticketId: string; reportId?: string }> {
    return this.http.post<{ message: string; ticketId: string; reportId?: string }>(`${this.apiUrl}/messages/${messageId}/report`, { reason, details });
  }

  editMessage(messageId: string, content: string): Observable<Message> {
    return this.http.put<Message>(`${this.apiUrl}/messages/${messageId}`, { content });
  }

  deleteMessage(messageId: string): Observable<Message> {
    return this.http.delete<Message>(`${this.apiUrl}/messages/${messageId}`);
  }

  markConversationRead(userId: string): Observable<{ readCount: number; messageIds: string[] }> {
    return this.http.post<{ readCount: number; messageIds: string[] }>(`${this.apiUrl}/messages/${userId}/read`, {});
  }

  resolvePartnerFromMessage(messageId: string): Observable<{ partnerId: string }> {
    return this.http.get<{ partnerId: string }>(`${this.apiUrl}/messages/message/${messageId}/partner`);
  }

  searchUsers(q: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/messages/search-users`, { params: { q } });
  }

  getAllowedContacts(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/messages/allowed-contacts`);
  }
}

