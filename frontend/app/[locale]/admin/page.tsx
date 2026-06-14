"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

/* ── Types matching backend admin schemas ── */

interface OverviewStats {
  total_users: number;
  active_today: number;
  online_now: number;
  sessions_today: number;
  avg_duration_seconds: number;
  match_queue_depth: number;
  new_feedback_count: number;
}

interface AdminUserItem {
  id: string;
  email: string;
  display_name: string;
  character_key: string | null;
  is_active: boolean;
  created_at: string;
  last_focus_at: string | null;
}

interface AdminUserList {
  items: AdminUserItem[];
  total: number;
  page: number;
  size: number;
}

interface AdminFeedbackItem {
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

interface AdminFeedbackList {
  items: AdminFeedbackItem[];
  total: number;
  page: number;
  size: number;
}

/* ── Stat Card ── */

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div
      className="pixel-panel"
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        className="font-silkscreen"
        style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.18em" }}
      >
        {label}
      </span>
      <span
        className="font-silkscreen"
        style={{ fontSize: 22, color: accent ?? "var(--ink)", letterSpacing: "0.05em" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Admin Dashboard ── */

type Tab = "overview" | "users" | "feedback";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);

  // Overview
  const [stats, setStats] = useState<OverviewStats | null>(null);

  // Users
  const [users, setUsers] = useState<AdminUserList | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userPage, setUserPage] = useState(1);

  // Feedback
  const [feedback, setFeedback] = useState<AdminFeedbackList | null>(null);
  const [fbFilter, setFbFilter] = useState<string>("");
  const [fbPage, setFbPage] = useState(1);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiFetch<OverviewStats>("/api/v1/admin/overview");
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    }
  }, []);

  const fetchUsers = useCallback(async (page: number, q: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), size: "20" });
      if (q.trim()) params.set("q", q.trim());
      const data = await apiFetch<AdminUserList>(`/api/v1/admin/users?${params}`);
      setUsers(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, []);

  const fetchFeedback = useCallback(async (page: number, status: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), size: "20" });
      if (status) params.set("status", status);
      const data = await apiFetch<AdminFeedbackList>(`/api/v1/admin/feedback?${params}`);
      setFeedback(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feedback");
    }
  }, []);

  useEffect(() => {
    if (tab === "overview") void fetchOverview();
    if (tab === "users") void fetchUsers(userPage, userQuery);
    if (tab === "feedback") void fetchFeedback(fbPage, fbFilter);
  }, [tab, fetchOverview, fetchUsers, fetchFeedback, userPage, userQuery, fbPage, fbFilter]);

  const toggleBan = async (userId: string, currentlyActive: boolean) => {
    const action = currentlyActive ? "ban" : "unban";
    try {
      await apiFetch(`/api/v1/admin/users/${userId}/${action}`, { method: "POST" });
      void fetchUsers(userPage, userQuery);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} user`);
    }
  };

  const updateFeedbackStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/v1/admin/feedback/${id}`, {
        method: "PATCH",
        body: { status },
      });
      void fetchFeedback(fbPage, fbFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update feedback");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "OVERVIEW" },
    { key: "users", label: "USERS" },
    { key: "feedback", label: "FEEDBACK" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span
          className="font-silkscreen"
          style={{ fontSize: 18, color: "var(--accent)", letterSpacing: "0.15em" }}
        >
          LBT ADMIN
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.18em" }}
        >
          DASHBOARD
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="font-silkscreen"
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 10,
            color: "#fca5a5",
            background: "rgba(220,38,38,0.15)",
            border: "1px solid rgba(248,113,113,0.4)",
          }}
        >
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className="pixel-btn"
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px",
              fontSize: 10,
              borderColor: tab === t.key ? "var(--accent-2)" : undefined,
              color: tab === t.key ? "var(--accent-2)" : undefined,
              opacity: tab === t.key ? 1 : 0.5,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW tab ── */}
      {tab === "overview" && stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          <StatCard label="TOTAL USERS" value={stats.total_users} accent="var(--accent)" />
          <StatCard label="ACTIVE TODAY" value={stats.active_today} accent="var(--accent-2)" />
          <StatCard label="ONLINE NOW" value={stats.online_now} accent="#6ee7b7" />
          <StatCard label="SESSIONS TODAY" value={stats.sessions_today} />
          <StatCard label="AVG DURATION" value={`${Math.round(stats.avg_duration_seconds / 60)}m`} />
          <StatCard label="MATCH QUEUE" value={stats.match_queue_depth} />
          <StatCard label="NEW FEEDBACK" value={stats.new_feedback_count} accent={stats.new_feedback_count > 0 ? "#fca5a5" : undefined} />
        </div>
      )}

      {/* ── USERS tab ── */}
      {tab === "users" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              className="pixel-input"
              placeholder="Search by email or name..."
              value={userQuery}
              onChange={(e) => { setUserQuery(e.target.value); setUserPage(1); }}
              style={{ maxWidth: 360 }}
            />
          </div>
          {users && (
            <>
              <div
                className="font-silkscreen"
                style={{ fontSize: 10, color: "var(--ink-mute)", marginBottom: 8 }}
              >
                {users.total} users · page {users.page}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {users.items.map((u) => (
                  <div
                    key={u.id}
                    className="pixel-panel"
                    style={{
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      opacity: u.is_active ? 1 : 0.5,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                      <span
                        className="font-silkscreen"
                        style={{ fontSize: 11, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {u.display_name}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.email}
                      </span>
                      <span
                        className="font-silkscreen"
                        style={{ fontSize: 9, color: "var(--ink-dim)" }}
                      >
                        {new Date(u.created_at).toLocaleDateString()}
                        {u.last_focus_at && ` · last focus ${new Date(u.last_focus_at).toLocaleDateString()}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="pixel-btn"
                      onClick={() => void toggleBan(u.id, u.is_active)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 9,
                        borderColor: u.is_active ? "#fca5a5" : "#6ee7b7",
                        color: u.is_active ? "#fca5a5" : "#6ee7b7",
                        flexShrink: 0,
                      }}
                    >
                      {u.is_active ? "BAN" : "UNBAN"}
                    </button>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                <button
                  type="button"
                  className="pixel-btn"
                  disabled={userPage <= 1}
                  onClick={() => setUserPage((p) => p - 1)}
                  style={{ padding: "6px 12px", fontSize: 10 }}
                >
                  PREV
                </button>
                <button
                  type="button"
                  className="pixel-btn"
                  disabled={users.items.length < 20}
                  onClick={() => setUserPage((p) => p + 1)}
                  style={{ padding: "6px 12px", fontSize: 10 }}
                >
                  NEXT
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FEEDBACK tab ── */}
      {tab === "feedback" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["", "new", "reviewed", "resolved"].map((s) => (
              <button
                key={s}
                type="button"
                className="pixel-btn"
                onClick={() => { setFbFilter(s); setFbPage(1); }}
                style={{
                  padding: "6px 12px",
                  fontSize: 9,
                  opacity: fbFilter === s ? 1 : 0.5,
                  borderColor: fbFilter === s ? "var(--accent-2)" : undefined,
                }}
              >
                {s || "ALL"}
              </button>
            ))}
          </div>
          {feedback && (
            <>
              <div
                className="font-silkscreen"
                style={{ fontSize: 10, color: "var(--ink-mute)", marginBottom: 8 }}
              >
                {feedback.total} items · page {feedback.page}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {feedback.items.map((fb) => (
                  <div
                    key={fb.id}
                    className="pixel-panel"
                    style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        className="font-silkscreen"
                        style={{ fontSize: 10, color: "var(--accent-3)", letterSpacing: "0.15em" }}
                      >
                        {fb.category.toUpperCase()}
                      </span>
                      <span
                        className="font-silkscreen"
                        style={{
                          fontSize: 9,
                          padding: "2px 8px",
                          border: "1px solid var(--panel-stroke)",
                          color: fb.status === "new" ? "#fca5a5" : fb.status === "reviewed" ? "var(--accent-2)" : "#6ee7b7",
                        }}
                      >
                        {fb.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
                      {fb.body}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                        {new Date(fb.created_at).toLocaleString()}
                        {fb.contact_email && ` · ${fb.contact_email}`}
                      </span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {fb.status !== "reviewed" && (
                          <button
                            type="button"
                            className="pixel-btn"
                            onClick={() => void updateFeedbackStatus(fb.id, "reviewed")}
                            style={{ padding: "3px 8px", fontSize: 8, borderColor: "var(--accent-2)", color: "var(--accent-2)" }}
                          >
                            REVIEWED
                          </button>
                        )}
                        {fb.status !== "resolved" && (
                          <button
                            type="button"
                            className="pixel-btn"
                            onClick={() => void updateFeedbackStatus(fb.id, "resolved")}
                            style={{ padding: "3px 8px", fontSize: 8, borderColor: "#6ee7b7", color: "#6ee7b7" }}
                          >
                            RESOLVED
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                <button
                  type="button"
                  className="pixel-btn"
                  disabled={fbPage <= 1}
                  onClick={() => setFbPage((p) => p - 1)}
                  style={{ padding: "6px 12px", fontSize: 10 }}
                >
                  PREV
                </button>
                <button
                  type="button"
                  className="pixel-btn"
                  disabled={feedback.items.length < 20}
                  onClick={() => setFbPage((p) => p + 1)}
                  style={{ padding: "6px 12px", fontSize: 10 }}
                >
                  NEXT
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
