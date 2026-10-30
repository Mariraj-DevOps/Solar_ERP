/**
 * Client API Service connecting to full-stack ERP backend endpoints.
 * Includes request timeout, error handling, RBAC, approvals, payments, attachments, and petty cash.
 */

const API_BASE = '/api';

export function getStoredToken(): string | null {
  return localStorage.getItem('erp_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('erp_token', token);
  } else {
    localStorage.removeItem('erp_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Request timeout controller (18s timeout)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort());
    }
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401) {
      setStoredToken(null);
      window.dispatchEvent(new CustomEvent('erp:auth-expired'));
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || `Request failed with status ${response.status}`);
    }

    return data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('The request timed out. Please check your network connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  // 1. Auth & Status
  auth: {
    login: (credentials: { email: string; password: string }) =>
      request<{ token: string; user: { id: string; email: string; fullName: string; role: any } }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(credentials) }
      ),
    me: () =>
      request<{ user: { id: string; email: string; fullName: string; role: any } }>('/auth/me'),
  },

  status: {
    get: () => request<any>('/status'),
  },

  // 2. Users (Master Admin & Account Maintenance)
  users: {
    list: () => request<any[]>('/users'),
    create: (data: any) => request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    resetPassword: (id: string, newPassword: string) =>
      request<any>(`/users/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) }),
  },

  // 3. Secondary Admins & Permissions Matrix
  secondaryAdmins: {
    list: () => request<any[]>('/secondary-admins'),
    assign: (data: any) => request<any>('/secondary-admins/assign', { method: 'POST', body: JSON.stringify(data) }),
    remove: (adminId: string, staffId: string) =>
      request<any>(`/secondary-admins/assign/${adminId}/${staffId}`, { method: 'DELETE' }),
  },

  // 4. Categories
  categories: {
    list: () => request<any[]>('/categories'),
    create: (data: any) => request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  },

  // 5. Teams
  teams: {
    list: () => request<any[]>('/teams'),
    create: (data: any) => request<any>('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    getWeekAssignments: (weekStart: string) => request<any[]>(`/teams/week/${weekStart}`),
    saveWeekAssignment: (weekStart: string, data: any) =>
      request<any>(`/teams/week/${weekStart}`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // 6. Daily Attendance & Approvals
  attendance: {
    list: (params: { weekStart?: string; date?: string; teamId?: string; staffUserId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.date) q.set('date', params.date);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      if (params.status) q.set('status', params.status);
      return request<any[]>(`/attendance?${q.toString()}`);
    },
    create: (data: any) => request<any>('/attendance', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/attendance/${id}`, { method: 'DELETE' }),
    getQueue: () => request<any[]>('/approvals/queue'),
    approve: (id: string) => request<any>(`/attendance/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason: string) =>
      request<any>(`/attendance/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },

  // 7. Additional Charges
  charges: {
    list: (params: { weekStart?: string; teamId?: string; staffUserId?: string }) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      return request<any[]>(`/charges?${q.toString()}`);
    },
    create: (data: any) => request<any>('/charges', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/charges/${id}`, { method: 'DELETE' }),
  },

  // 8. Financial Adjustments
  adjustments: {
    list: (params: { weekStart?: string; teamId?: string; staffUserId?: string }) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      return request<any[]>(`/adjustments?${q.toString()}`);
    },
    create: (data: any) => request<any>('/adjustments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/adjustments/${id}`, { method: 'DELETE' }),
  },

  // 9. Supplier Bills
  supplierBills: {
    list: (weekStart: string) => request<any[]>(`/supplier-bills?weekStart=${weekStart}`),
    create: (data: any) => request<any>('/supplier-bills', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/supplier-bills/${id}`, { method: 'DELETE' }),
  },

  // 10. Merges
  merges: {
    getSummaryGroups: (weekStart: string) => request<any[]>(`/merges/summary-groups?weekStart=${weekStart}`),
    createSummaryGroup: (data: any) => request<any>('/merges/summary-groups', { method: 'POST', body: JSON.stringify(data) }),
    deleteSummaryGroup: (id: string) => request<any>(`/merges/summary-groups/${id}`, { method: 'DELETE' }),
    previewAttendanceMerge: (data: any) => request<any>('/merges/attendance/preview', { method: 'POST', body: JSON.stringify(data) }),
    executeAttendanceMerge: (data: any) => request<any>('/merges/attendance/execute', { method: 'POST', body: JSON.stringify(data) }),
  },

  // 11. Reports
  reports: {
    getWeekly: (weekStart: string, staffUserIdOrSignal?: string | AbortSignal, maybeSignal?: AbortSignal) => {
      const staffUserId = typeof staffUserIdOrSignal === 'string' ? staffUserIdOrSignal : undefined;
      const signal = staffUserIdOrSignal instanceof AbortSignal ? staffUserIdOrSignal : maybeSignal;
      const q = new URLSearchParams({ weekStart });
      if (staffUserId) q.set('staffUserId', staffUserId);
      return request<any>(`/reports/weekly?${q.toString()}`, signal ? { signal } : {});
    },
    getMonthly: (year: number, month: number, staffUserIdOrSignal?: string | AbortSignal, maybeSignal?: AbortSignal) => {
      const staffUserId = typeof staffUserIdOrSignal === 'string' ? staffUserIdOrSignal : undefined;
      const signal = staffUserIdOrSignal instanceof AbortSignal ? staffUserIdOrSignal : maybeSignal;
      const q = new URLSearchParams({ year: String(year), month: String(month) });
      if (staffUserId) q.set('staffUserId', staffUserId);
      return request<any>(`/reports/monthly?${q.toString()}`, signal ? { signal } : {});
    },
  },

  // 12. Weekly Payments & Payment Tracker
  payments: {
    list: (params: { weekStart?: string; teamId?: string; status?: string; staffUserId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.status) q.set('status', params.status);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      return request<any[]>(`/payments?${q.toString()}`);
    },
    markPaid: (data: any) => request<any>('/payments/mark-paid', { method: 'POST', body: JSON.stringify(data) }),
    getHistoricalOutstanding: (currentWeekStart?: string, staffUserId?: string) => {
      const q = new URLSearchParams();
      if (currentWeekStart) q.set('currentWeekStart', currentWeekStart);
      if (staffUserId) q.set('staffUserId', staffUserId);
      return request<any[]>(`/payments/historical-outstanding?${q.toString()}`);
    },
  },

  // 13. Attachments & Document Management
  attachments: {
    list: (params: { recordType?: string; recordId?: string; teamId?: string; weekStart?: string; staffUserId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.recordType) q.set('recordType', params.recordType);
      if (params.recordId) q.set('recordId', params.recordId);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      return request<any[]>(`/attachments?${q.toString()}`);
    },
    upload: (data: any) => request<any>('/attachments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/attachments/${id}`, { method: 'DELETE' }),
    downloadUrl: (id: string) => `${API_BASE}/attachments/${id}/download`,
  },

  // 14. Master-Admin Accounts Ledger
  officeLedger: {
    list: (params: { startDate?: string; endDate?: string; category?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.startDate) q.set('startDate', params.startDate);
      if (params.endDate) q.set('endDate', params.endDate);
      if (params.category) q.set('category', params.category);
      return request<any[]>(`/office-ledger?${q.toString()}`);
    },
    create: (data: any) => request<any>('/office-ledger', { method: 'POST', body: JSON.stringify(data) }),
  },

  // 15. Petty Cash Module (Excel Reference)
  pettyCash: {
    get: (params: { month?: number; year?: number; date?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.month) q.set('month', String(params.month));
      if (params.year) q.set('year', String(params.year));
      if (params.date) q.set('date', params.date);
      return request<{
        openingBalances: { openingInAccount: number; openingInHand: number };
        entries: any[];
        currentAccountBalance: number;
        currentHandBalance: number;
        totalAvailableFunds: number;
      }>(`/petty-cash?${q.toString()}`);
    },
    create: (data: any) => request<any>('/petty-cash', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/petty-cash/${id}`, { method: 'DELETE' }),
  },

  // 16. In-App Notifications
  notifications: {
    list: () => request<{ notifications: any[]; unreadCount: number }>('/notifications'),
    markRead: (id: string) => request<any>(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request<any>('/notifications/read-all', { method: 'POST' }),
  },

  // 17. Audit & Settings
  audit: {
    list: (params: { limit?: number; entityType?: string; actorId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.limit) q.set('limit', String(params.limit));
      if (params.entityType) q.set('entityType', params.entityType);
      if (params.actorId) q.set('actorId', params.actorId);
      return request<any[]>(`/audit?${q.toString()}`);
    },
  },

  settings: {
    get: () => request<Record<string, any>>('/settings'),
    save: (key: string, value: any) => request<any>('/settings', { method: 'POST', body: JSON.stringify({ key, value }) }),
    seedSampleData: () => request<{ success: boolean; message: string }>('/seed-sample-data', { method: 'POST' }),
  },
};
