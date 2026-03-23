import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PointHistoryPage, User } from '../models/models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/profile`);
  }

  updateProfile(data: any): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/profile`, data);
  }

  changePassword(data: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/change-password`, data);
  }

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/users/stats`);
  }

  getVolunteers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users/volunteers`);
  }

  getPointsSummary(): Observable<{ rewardPoints: number; totalPointsEarned: number }> {
    return this.http.get<{ rewardPoints: number; totalPointsEarned: number }>(`${this.apiUrl}/users/points/summary`);
  }

  getPointsHistory(params?: { page?: number; limit?: number }): Observable<PointHistoryPage> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    const url = `${this.apiUrl}/users/points/history${qs ? `?${qs}` : ''}`;
    return this.http.get<PointHistoryPage>(url);
  }
}
