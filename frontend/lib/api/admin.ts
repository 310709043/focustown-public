import { apiFetch } from "./client";

// ── Types ──────────────────────────────────────────────────────────────

export interface OverviewStats {
  total_users: number;
  active_today: number;
  online_now: number;
  sessions_today: number;
  avg_duration_seconds: number;
  active_sessions: number;
  match_queue_depth: number;
  matches_today: number;
  new_feedback_count: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  display_name: string;
  character_key: string | null;
  is_active: boolean;
  created_at: string;
  last_focus_at: string | null;
}

export interface AdminSessionItem {
  id: string;
  user_id: string;
  user_display_name: string | null;
  mode: string;
  duration_seconds: number;
  elapsed_seconds: number;
  status: string;
  task_label: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface AdminWalletTxItem {
  id: string;
  user_id: string;
  user_display_name: string | null;
  currency_code: string;
  delta_minor: number;
  reason: string;
  balance_after_minor: number;
  created_at: string;
}

export interface AdminWalletDistribution {
  total_supply_minor: number;
  holder_count: number;
  buckets: { label: string; count: number }[];
}

export interface AdminMatchItem {
  id: string;
  requester_id: string;
  requester_name: string | null;
  candidate_id: string;
  candidate_name: string | null;
  compatibility: number;
  status: string;
  created_at: string;
}

export interface AdminMessageItem {
  id: string;
  match_id: string;
  sender_id: string;
  sender_name: string | null;
  kind: string;
  body: string;
  created_at: string;
}

export interface AdminFeedbackItem {
  id: string;
  user_id: string | null;
  category: string;
  body: string;
  contact_email: string | null;
  status: string;
  locale: string;
  app_version: string | null;
  created_at: string;
}

export interface AdminAnnouncementItem {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ── API calls ──────────────────────────────────────────────────────────

export const adminApi = {
  overview: () => apiFetch<OverviewStats>("/api/v1/admin/overview"),

  users: (page = 1, q = "") =>
    apiFetch<Paginated<AdminUserItem>>(
      `/api/v1/admin/users?page=${page}&size=20&q=${encodeURIComponent(q)}`,
    ),
  ban: (userId: string) =>
    apiFetch<{ id: string; is_active: boolean }>(`/api/v1/admin/users/${userId}/ban`, {
      method: "POST",
    }),
  unban: (userId: string) =>
    apiFetch<{ id: string; is_active: boolean }>(
      `/api/v1/admin/users/${userId}/unban`,
      { method: "POST" },
    ),

  sessions: (page = 1, status?: string) => {
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (status) params.set("status", status);
    return apiFetch<Paginated<AdminSessionItem>>(
      `/api/v1/admin/sessions?${params.toString()}`,
    );
  },
  forceEndSession: (sessionId: string) =>
    apiFetch<{ id: string; status: string; already_ended: boolean }>(
      `/api/v1/admin/sessions/${sessionId}/force-end`,
      { method: "POST" },
    ),

  transactions: (page = 1, userId?: string, reason?: string) => {
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (userId) params.set("user_id", userId);
    if (reason) params.set("reason", reason);
    return apiFetch<Paginated<AdminWalletTxItem>>(
      `/api/v1/admin/economy/transactions?${params.toString()}`,
    );
  },
  walletDistribution: () =>
    apiFetch<AdminWalletDistribution>("/api/v1/admin/economy/distribution"),

  matches: (page = 1, status?: string) => {
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (status) params.set("status", status);
    return apiFetch<Paginated<AdminMatchItem>>(
      `/api/v1/admin/matches?${params.toString()}`,
    );
  },

  messages: (page = 1, q = "", matchId?: string) => {
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (q) params.set("q", q);
    if (matchId) params.set("match_id", matchId);
    return apiFetch<Paginated<AdminMessageItem>>(
      `/api/v1/admin/messages?${params.toString()}`,
    );
  },
  deleteMessage: (messageId: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/admin/messages/${messageId}`, {
      method: "DELETE",
    }),

  feedback: (page = 1, status?: string) => {
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (status) params.set("status", status);
    return apiFetch<Paginated<AdminFeedbackItem>>(
      `/api/v1/admin/feedback?${params.toString()}`,
    );
  },
  updateFeedbackStatus: (feedbackId: string, status: string) =>
    apiFetch<{ id: string; status: string }>(
      `/api/v1/admin/feedback/${feedbackId}`,
      { method: "PATCH", body: { status } },
    ),

  announcements: (page = 1) =>
    apiFetch<Paginated<AdminAnnouncementItem>>(
      `/api/v1/admin/announcements?page=${page}&size=20`,
    ),
  createAnnouncement: (title: string, body: string) =>
    apiFetch<AdminAnnouncementItem>("/api/v1/admin/announcements", {
      method: "POST",
      body: { title, body },
    }),
  updateAnnouncement: (
    id: string,
    data: { title?: string; body?: string; is_active?: boolean },
  ) =>
    apiFetch<AdminAnnouncementItem>(`/api/v1/admin/announcements/${id}`, {
      method: "PATCH",
      body: data,
    }),
  deleteAnnouncement: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/admin/announcements/${id}`, {
      method: "DELETE",
    }),
};
