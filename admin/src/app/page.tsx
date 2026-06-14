"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminFetch,
  clearTokens,
  isLoggedIn,
  login,
  register,
  type AdminFeedbackItem,
  type AdminFeedbackList,
  type AdminUserList,
  type OverviewStats,
} from "@/lib/api";

/* ══════════════════════════════════════
   Login Screen
   ══════════════════════════════════════ */

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        const autoEmail = `${displayName.toLowerCase().replace(/\s+/g, "")}@lbt.local`;
        await register(autoEmail, password, displayName);
      }
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "login" ? "Login failed" : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="panel"
        style={{ padding: 32, width: 360, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 18, color: "var(--accent)", letterSpacing: "0.15em" }}>
            LBT ADMIN
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4 }}>
            Low Battery Town Dashboard
          </div>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 3 }}>
            {error}
          </div>
        )}

        {mode === "register" ? (
          <input
            type="text"
            placeholder="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        ) : (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="btn active" disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "..." : mode === "login" ? "LOGIN" : "REGISTER"}
        </button>

        <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-dim)" }}>
          {mode === "login" ? (
            <>
              還沒有帳號？{" "}
              <button type="button" onClick={() => { setMode("register"); setError(""); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>
                註冊
              </button>
            </>
          ) : (
            <>
              已有帳號？{" "}
              <button type="button" onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>
                登入
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/* ══════════════════════════════════════
   Stat Card
   ══════════════════════════════════════ */

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="panel" style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, color: color ?? "var(--ink)", letterSpacing: "0.03em" }}>
        {value}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Pagination
   ══════════════════════════════════════ */

function Pagination({ page, hasMore, onPrev, onNext }: { page: number; hasMore: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
      <button type="button" className="btn" disabled={page <= 1} onClick={onPrev}>← PREV</button>
      <span style={{ padding: "8px 12px", fontSize: 12, color: "var(--ink-dim)" }}>Page {page}</span>
      <button type="button" className="btn" disabled={!hasMore} onClick={onNext}>NEXT →</button>
    </div>
  );
}

/* ══════════════════════════════════════
   Dashboard
   ══════════════════════════════════════ */

type Tab = "overview" | "users" | "feedback";

function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);

  /* Overview */
  const [stats, setStats] = useState<OverviewStats | null>(null);

  /* Users */
  const [users, setUsers] = useState<AdminUserList | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userPage, setUserPage] = useState(1);

  /* Feedback */
  const [feedback, setFeedback] = useState<AdminFeedbackList | null>(null);
  const [fbFilter, setFbFilter] = useState("");
  const [fbPage, setFbPage] = useState(1);

  const fetchOverview = useCallback(async () => {
    try {
      setStats(await adminFetch<OverviewStats>("/api/v1/admin/overview"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  const fetchUsers = useCallback(async (page: number, q: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), size: "20" });
      if (q.trim()) params.set("q", q.trim());
      setUsers(await adminFetch<AdminUserList>(`/api/v1/admin/users?${params}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  const fetchFeedback = useCallback(async (page: number, status: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), size: "20" });
      if (status) params.set("status", status);
      setFeedback(await adminFetch<AdminFeedbackList>(`/api/v1/admin/feedback?${params}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (tab === "overview") void fetchOverview();
    if (tab === "users") void fetchUsers(userPage, userQuery);
    if (tab === "feedback") void fetchFeedback(fbPage, fbFilter);
  }, [tab, fetchOverview, fetchUsers, fetchFeedback, userPage, userQuery, fbPage, fbFilter]);

  const toggleBan = async (userId: string, active: boolean) => {
    try {
      await adminFetch(`/api/v1/admin/users/${userId}/${active ? "ban" : "unban"}`, { method: "POST" });
      void fetchUsers(userPage, userQuery);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const updateFbStatus = async (id: string, status: string) => {
    try {
      await adminFetch(`/api/v1/admin/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      void fetchFeedback(fbPage, fbFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const handleLogout = () => {
    clearTokens();
    window.location.reload();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "總覽" },
    { key: "users", label: "用戶管理" },
    { key: "feedback", label: "回饋管理" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 20, color: "var(--accent)", letterSpacing: "0.12em" }}>LBT ADMIN</span>
          <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>Low Battery Town</span>
        </div>
        <button type="button" className="btn" onClick={handleLogout} style={{ fontSize: 11 }}>登出</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 3 }}>
          {error}
          <button type="button" onClick={() => setError(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--panel-stroke)", paddingBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && stats && (
        <div className="stat-grid">
          <StatCard label="總用戶數" value={stats.total_users} color="var(--accent)" />
          <StatCard label="今日活躍" value={stats.active_today} color="var(--accent-2)" />
          <StatCard label="線上人數" value={stats.online_now} color="var(--green)" />
          <StatCard label="今日專注時段" value={stats.sessions_today} />
          <StatCard label="平均專注時長" value={`${Math.round(stats.avg_duration_seconds / 60)} 分鐘`} />
          <StatCard label="配對佇列" value={stats.match_queue_depth} />
          <StatCard label="新回饋" value={stats.new_feedback_count} color={stats.new_feedback_count > 0 ? "var(--red)" : undefined} />
        </div>
      )}
      {tab === "overview" && !stats && !error && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ink-dim)" }}>載入中...</div>
      )}

      {/* ── Users ── */}
      {tab === "users" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <input
              type="text"
              placeholder="搜尋 email 或暱稱..."
              value={userQuery}
              onChange={(e) => { setUserQuery(e.target.value); setUserPage(1); }}
              style={{ flex: 1, maxWidth: 320 }}
            />
            {users && <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>共 {users.total} 位用戶</span>}
          </div>

          {users && (
            <>
              <div className="panel" style={{ overflow: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>暱稱</th>
                      <th>Email</th>
                      <th>狀態</th>
                      <th>註冊日期</th>
                      <th>最後專注</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.items.map((u) => (
                      <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                        <td style={{ fontWeight: 600 }}>{u.display_name}</td>
                        <td style={{ color: "var(--ink-mute)" }}>{u.email}</td>
                        <td>
                          <span className={`badge ${u.is_active ? "active" : "banned"}`}>
                            {u.is_active ? "正常" : "停權"}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                          {new Date(u.created_at).toLocaleDateString("zh-TW")}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                          {u.last_focus_at ? new Date(u.last_focus_at).toLocaleDateString("zh-TW") : "—"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`btn ${u.is_active ? "danger" : "success"}`}
                            onClick={() => void toggleBan(u.id, u.is_active)}
                            style={{ padding: "4px 10px", fontSize: 11 }}
                          >
                            {u.is_active ? "停權" : "解除"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={userPage}
                hasMore={users.items.length >= 20}
                onPrev={() => setUserPage((p) => p - 1)}
                onNext={() => setUserPage((p) => p + 1)}
              />
            </>
          )}
        </>
      )}

      {/* ── Feedback ── */}
      {tab === "feedback" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
            {[
              { value: "", label: "全部" },
              { value: "new", label: "新的" },
              { value: "reviewed", label: "已審閱" },
              { value: "resolved", label: "已解決" },
            ].map((s) => (
              <button
                key={s.value}
                type="button"
                className={`btn ${fbFilter === s.value ? "active" : ""}`}
                onClick={() => { setFbFilter(s.value); setFbPage(1); }}
                style={{ fontSize: 11 }}
              >
                {s.label}
              </button>
            ))}
            {feedback && <span style={{ fontSize: 12, color: "var(--ink-dim)", marginLeft: 8 }}>共 {feedback.total} 筆</span>}
          </div>

          {feedback && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {feedback.items.map((fb: AdminFeedbackItem) => (
                  <div key={fb.id} className="panel" style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: "var(--accent-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          {fb.category}
                        </span>
                        <span className={`badge ${fb.status}`}>{fb.status}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                        {new Date(fb.created_at).toLocaleString("zh-TW")}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, marginBottom: 10 }}>
                      {fb.body}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                        {fb.contact_email ?? "匿名"}
                        {fb.locale && ` · ${fb.locale}`}
                        {fb.app_version && ` · v${fb.app_version}`}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {fb.status !== "reviewed" && (
                          <button type="button" className="btn active" onClick={() => void updateFbStatus(fb.id, "reviewed")} style={{ padding: "4px 10px", fontSize: 10 }}>
                            標記已審閱
                          </button>
                        )}
                        {fb.status !== "resolved" && (
                          <button type="button" className="btn success" onClick={() => void updateFbStatus(fb.id, "resolved")} style={{ padding: "4px 10px", fontSize: 10 }}>
                            標記已解決
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {feedback.items.length === 0 && (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--ink-dim)" }}>沒有符合條件的回饋</div>
                )}
              </div>
              <Pagination
                page={fbPage}
                hasMore={feedback.items.length >= 20}
                onPrev={() => setFbPage((p) => p - 1)}
                onNext={() => setFbPage((p) => p + 1)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   Root Page — auth gate
   ══════════════════════════════════════ */

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  if (authed === null) return null; // SSR hydration guard

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return <Dashboard />;
}
