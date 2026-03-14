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
}

export interface MessageThreadResponse extends ConversationLockMeta {
  messages: Message[];
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

  getMessages(userId: string, limit = 100): Observable<MessageThreadResponse> {
    return this.http.get<MessageThreadResponse>(`${this.apiUrl}/messages/${userId}`, { params: { limit: String(limit) } });
  }

  searchUsers(q: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/messages/search-users`, { params: { q } });
  }

  getAllowedContacts(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/messages/allowed-contacts`);
  }
}

