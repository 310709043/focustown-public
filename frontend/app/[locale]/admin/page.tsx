"use client";

import { useCallback, useEffect, useState } from "react";

import {
  adminApi,
  type AdminAnnouncementItem,
  type AdminFeedbackItem,
  type AdminMatchItem,
  type AdminMessageItem,
  type AdminSessionItem,
  type AdminUserItem,
  type AdminWalletDistribution,
  type AdminWalletTxItem,
  type OverviewStats,
} from "@/lib/api/admin";
import { pushErrorToast, pushSuccessToast } from "@/lib/state/toastStore";
import { tokenStore } from "@/lib/api/client";
import { config } from "@/lib/config";

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function fmtMinor(minor: number) {
  return (minor / 100).toFixed(2);
}

async function downloadCsv(path: string, filename: string) {
  const tokens = tokenStore.load();
  const headers: Record<string, string> = {};
  if (tokens) headers["Authorization"] = `Bearer ${tokens.access_token}`;
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/v1${path}`, { headers });
    if (!res.ok) { pushErrorToast("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    pushErrorToast("Export failed");
  }
}

// ── Tab type ───────────────────────────────────────────────────────────

type Tab =
  | "overview"
  | "users"
  | "sessions"
  | "economy"
  | "matches"
  | "messages"
  | "feedback"
  | "announcements";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "sessions", label: "Sessions" },
  { key: "economy", label: "Economy" },
  { key: "matches", label: "Matches" },
  { key: "messages", label: "Chat Mod" },
  { key: "feedback", label: "Feedback" },
  { key: "announcements", label: "Announce" },
];

// ── Styles ─────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "rgba(20,10,50,0.85)",
  border: "1px solid var(--panel-stroke)",
  borderRadius: 8,
  padding: 16,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 11,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--panel-stroke-strong)",
  color: "var(--ink-mute)",
  fontSize: 10,
  letterSpacing: "0.1em",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--panel-stroke)",
  color: "var(--ink)",
};

const btnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 10,
  cursor: "pointer",
  border: "1px solid var(--panel-stroke-strong)",
  borderRadius: 4,
  background: "rgba(30,15,60,0.8)",
  color: "var(--ink)",
};

const dangerBtnStyle: React.CSSProperties = {
  ...btnStyle,
  borderColor: "var(--coral)",
  color: "var(--coral)",
};

// ── Main Page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [authError, setAuthError] = useState(false);

  // Quick auth check — try loading overview
  useEffect(() => {
    adminApi.overview().catch(() => setAuthError(true));
  }, []);

  if (authError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--coral)",
          fontFamily: "var(--font-silkscreen)",
          fontSize: 14,
        }}
      >
        403 — Admin access required
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        padding: "16px 20px",
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          fontSize: 14,
          letterSpacing: "0.2em",
          color: "var(--accent)",
          marginBottom: 16,
        }}
      >
        LBT ADMIN CONSOLE
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="font-silkscreen"
            onClick={() => setTab(t.key)}
            style={{
              ...btnStyle,
              background:
                tab === t.key ? "var(--accent)" : "rgba(30,15,60,0.8)",
              color: tab === t.key ? "#0a0524" : "var(--ink-mute)",
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "overview" && <OverviewPanel />}
      {tab === "users" && <UsersPanel />}
      {tab === "sessions" && <SessionsPanel />}
      {tab === "economy" && <EconomyPanel />}
      {tab === "matches" && <MatchesPanel />}
      {tab === "messages" && <MessagesPanel />}
      {tab === "feedback" && <FeedbackPanel />}
      {tab === "announcements" && <AnnouncementsPanel />}
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────────────

function OverviewPanel() {
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    adminApi.overview().then(setStats).catch(() => {
      pushErrorToast("Failed to load overview");
    });
  }, []);

  if (!stats) return <div className="font-silkscreen" style={{ color: "var(--ink-mute)" }}>Loading...</div>;

  const cards: { label: string; value: string | number }[] = [
    { label: "Total Users", value: stats.total_users },
    { label: "Active Today", value: stats.active_today },
    { label: "Sessions Today", value: stats.sessions_today },
    { label: "Active Sessions", value: stats.active_sessions },
    { label: "Avg Duration", value: `${Math.round(stats.avg_duration_seconds / 60)}m` },
    { label: "Match Queue", value: stats.match_queue_depth },
    { label: "Matches Today", value: stats.matches_today },
    { label: "New Feedback", value: stats.new_feedback_count },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {cards.map((c) => (
        <div key={c.label} style={panelStyle}>
          <div className="font-silkscreen" style={{ fontSize: 9, color: "var(--ink-mute)", letterSpacing: "0.15em" }}>
            {c.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-vt323)", color: "var(--accent)", marginTop: 4 }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pagination helper ──────────────────────────────────────────────────

function Pager({
  page,
  total,
  size,
  onPage,
}: {
  page: number;
  total: number;
  size: number;
  onPage: (p: number) => void;
}) {
  const maxPage = Math.max(1, Math.ceil(total / size));
  return (
    <div className="font-silkscreen" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 10 }}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} style={btnStyle}>
        ◀
      </button>
      <span style={{ color: "var(--ink-mute)" }}>
        {page} / {maxPage} ({total})
      </span>
      <button type="button" disabled={page >= maxPage} onClick={() => onPage(page + 1)} style={btnStyle}>
        ▶
      </button>
    </div>
  );
}

// ── Users ──────────────────────────────────────────────────────────────

function UsersPanel() {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");

  const load = useCallback((p: number, search: string) => {
    adminApi.users(p, search).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load users"));
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const toggleBan = async (user: AdminUserItem) => {
    try {
      const res = user.is_active
        ? await adminApi.ban(user.id)
        : await adminApi.unban(user.id);
      pushSuccessToast(res.is_active ? "Unbanned" : "Banned");
      load(page, q);
    } catch {
      pushErrorToast("Action failed");
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search email / name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(1, q)}
          className="pixel-input"
          style={{ flex: 1, fontSize: 11 }}
        />
        <button type="button" onClick={() => load(1, q)} style={btnStyle}>Search</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Active</th>
              <th style={thStyle}>Joined</th>
              <th style={thStyle}>Last Focus</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td style={tdStyle}>{u.display_name}</td>
                <td style={tdStyle}>{u.email}</td>
                <td style={{ ...tdStyle, color: u.is_active ? "var(--teal)" : "var(--coral)" }}>
                  {u.is_active ? "YES" : "BANNED"}
                </td>
                <td style={tdStyle}>{fmtDate(u.created_at)}</td>
                <td style={tdStyle}>{fmtDate(u.last_focus_at)}</td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => toggleBan(u)}
                    style={u.is_active ? dangerBtnStyle : btnStyle}
                  >
                    {u.is_active ? "Ban" : "Unban"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} size={20} onPage={(p) => load(p, q)} />
    </div>
  );
}

// ── Sessions ──────────────────────────────────────────────────────────

function SessionsPanel() {
  const [items, setItems] = useState<AdminSessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");

  const load = useCallback((p: number, s: string) => {
    adminApi.sessions(p, s || undefined).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load sessions"));
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const forceEnd = async (id: string) => {
    try {
      const res = await adminApi.forceEndSession(id);
      pushSuccessToast(res.already_ended ? "Already ended" : "Force ended");
      load(page, status);
    } catch {
      pushErrorToast("Force end failed");
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ marginBottom: 12 }}>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); load(1, e.target.value); }}
          className="pixel-input"
          style={{ fontSize: 11 }}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="abandoned">Abandoned</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Mode</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Task</th>
              <th style={thStyle}>Started</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.user_display_name ?? s.user_id.slice(0, 8)}</td>
                <td style={tdStyle}>{s.mode}</td>
                <td style={tdStyle}>{Math.round(s.duration_seconds / 60)}m</td>
                <td style={{
                  ...tdStyle,
                  color: s.status === "active" ? "var(--teal)" : s.status === "completed" ? "var(--accent)" : "var(--ink-mute)",
                }}>
                  {s.status}
                </td>
                <td style={tdStyle}>{s.task_label ?? "-"}</td>
                <td style={tdStyle}>{fmtDate(s.started_at)}</td>
                <td style={tdStyle}>
                  {s.status === "active" && (
                    <button type="button" onClick={() => forceEnd(s.id)} style={dangerBtnStyle}>
                      Force End
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} size={20} onPage={(p) => load(p, status)} />
    </div>
  );
}

// ── Economy ────────────────────────────────────────────────────────────

function EconomyPanel() {
  const [dist, setDist] = useState<AdminWalletDistribution | null>(null);
  const [items, setItems] = useState<AdminWalletTxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const loadTx = useCallback((p: number) => {
    adminApi.transactions(p).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load transactions"));
  }, []);

  useEffect(() => {
    adminApi.walletDistribution().then(setDist).catch(() => {
      pushErrorToast("Failed to load distribution");
    });
    loadTx(1);
  }, [loadTx]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Distribution */}
      {dist && (
        <div style={panelStyle}>
          <div className="font-silkscreen" style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.15em", marginBottom: 8 }}>
            T-COIN DISTRIBUTION
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
            <div>
              <span style={{ color: "var(--ink-mute)" }}>Total Supply: </span>
              <span style={{ color: "var(--accent)" }}>{fmtMinor(dist.total_supply_minor)} T</span>
            </div>
            <div>
              <span style={{ color: "var(--ink-mute)" }}>Holders: </span>
              <span style={{ color: "var(--accent)" }}>{dist.holder_count}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {dist.buckets.map((b) => (
              <div key={b.label} style={{ padding: "4px 10px", border: "1px solid var(--panel-stroke)", borderRadius: 4, fontSize: 10 }}>
                <span style={{ color: "var(--ink-mute)" }}>{b.label} cT: </span>
                <span style={{ color: "var(--accent)" }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction ledger */}
      <div style={panelStyle}>
        <div className="font-silkscreen" style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.15em", marginBottom: 8 }}>
          TRANSACTION LEDGER
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Delta</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}>Balance After</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <tr key={tx.id}>
                  <td style={tdStyle}>{tx.user_display_name ?? tx.user_id.slice(0, 8)}</td>
                  <td style={{
                    ...tdStyle,
                    color: tx.delta_minor >= 0 ? "var(--teal)" : "var(--coral)",
                  }}>
                    {tx.delta_minor >= 0 ? "+" : ""}{fmtMinor(tx.delta_minor)}
                  </td>
                  <td style={tdStyle}>{tx.reason}</td>
                  <td style={tdStyle}>{fmtMinor(tx.balance_after_minor)}</td>
                  <td style={tdStyle}>{fmtDate(tx.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={total} size={20} onPage={loadTx} />
      </div>

      {/* Export buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => downloadCsv("/admin/export/users", "users.csv")} style={btnStyle}>
          Export Users CSV
        </button>
        <button type="button" onClick={() => downloadCsv("/admin/export/sessions", "sessions.csv")} style={btnStyle}>
          Export Sessions CSV
        </button>
      </div>
    </div>
  );
}

// ── Matches ────────────────────────────────────────────────────────────

function MatchesPanel() {
  const [items, setItems] = useState<AdminMatchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const load = useCallback((p: number, s: string) => {
    adminApi.matches(p, s || undefined).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load matches"));
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  return (
    <div style={panelStyle}>
      <div style={{ marginBottom: 12 }}>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); load(1, e.target.value); }}
          className="pixel-input"
          style={{ fontSize: 11 }}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="skipped">Skipped</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Requester</th>
              <th style={thStyle}>Candidate</th>
              <th style={thStyle}>Compat</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td style={tdStyle}>{m.requester_name ?? m.requester_id.slice(0, 8)}</td>
                <td style={tdStyle}>{m.candidate_name ?? m.candidate_id.slice(0, 8)}</td>
                <td style={tdStyle}>{m.compatibility}%</td>
                <td style={tdStyle}>{m.status}</td>
                <td style={tdStyle}>{fmtDate(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} size={20} onPage={(p) => load(p, status)} />
    </div>
  );
}

// ── Chat Moderation ────────────────────────────────────────────────────

function MessagesPanel() {
  const [items, setItems] = useState<AdminMessageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");

  const load = useCallback((p: number, search: string) => {
    adminApi.messages(p, search).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load messages"));
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteMessage(id);
      pushSuccessToast("Message deleted");
      load(page, q);
    } catch {
      pushErrorToast("Delete failed");
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search message content..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(1, q)}
          className="pixel-input"
          style={{ flex: 1, fontSize: 11 }}
        />
        <button type="button" onClick={() => load(1, q)} style={btnStyle}>Search</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Sender</th>
              <th style={thStyle}>Message</th>
              <th style={thStyle}>Kind</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td style={tdStyle}>{m.sender_name ?? m.sender_id.slice(0, 8)}</td>
                <td style={{ ...tdStyle, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.body}
                </td>
                <td style={tdStyle}>{m.kind}</td>
                <td style={tdStyle}>{fmtDate(m.created_at)}</td>
                <td style={tdStyle}>
                  <button type="button" onClick={() => handleDelete(m.id)} style={dangerBtnStyle}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} size={20} onPage={(p) => load(p, q)} />
    </div>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────

function FeedbackPanel() {
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const load = useCallback((p: number, s: string) => {
    adminApi.feedback(p, s || undefined).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load feedback"));
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await adminApi.updateFeedbackStatus(id, newStatus);
      pushSuccessToast(`Marked ${newStatus}`);
      load(page, status);
    } catch {
      pushErrorToast("Update failed");
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ marginBottom: 12 }}>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); load(1, e.target.value); }}
          className="pixel-input"
          style={{ fontSize: 11 }}
        >
          <option value="">All</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Body</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id}>
                <td style={tdStyle}>{f.category}</td>
                <td style={{ ...tdStyle, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.body}
                </td>
                <td style={tdStyle}>{f.contact_email ?? "-"}</td>
                <td style={tdStyle}>{f.status}</td>
                <td style={tdStyle}>{fmtDate(f.created_at)}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {f.status === "new" && (
                      <button type="button" onClick={() => updateStatus(f.id, "reviewed")} style={btnStyle}>
                        Review
                      </button>
                    )}
                    {f.status !== "resolved" && (
                      <button type="button" onClick={() => updateStatus(f.id, "resolved")} style={btnStyle}>
                        Resolve
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} size={20} onPage={(p) => load(p, status)} />
    </div>
  );
}

// ── Announcements ─────────────────────────────────────────────────────

function AnnouncementsPanel() {
  const [items, setItems] = useState<AdminAnnouncementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback((p: number) => {
    adminApi.announcements(p).then((r) => {
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
    }).catch(() => pushErrorToast("Failed to load announcements"));
  }, []);

  useEffect(() => { load(1); }, [load]);

  const create = async () => {
    if (!title.trim() || !body.trim()) return;
    try {
      await adminApi.createAnnouncement(title, body);
      pushSuccessToast("Announcement created");
      setTitle("");
      setBody("");
      load(1);
    } catch {
      pushErrorToast("Create failed");
    }
  };

  const toggle = async (ann: AdminAnnouncementItem) => {
    try {
      await adminApi.updateAnnouncement(ann.id, { is_active: !ann.is_active });
      pushSuccessToast(ann.is_active ? "Deactivated" : "Activated");
      load(page);
    } catch {
      pushErrorToast("Update failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await adminApi.deleteAnnouncement(id);
      pushSuccessToast("Deleted");
      load(page);
    } catch {
      pushErrorToast("Delete failed");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Create form */}
      <div style={panelStyle}>
        <div className="font-silkscreen" style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.15em", marginBottom: 8 }}>
          NEW ANNOUNCEMENT
        </div>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="pixel-input"
          style={{ width: "100%", fontSize: 11, marginBottom: 8 }}
        />
        <textarea
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="pixel-input"
          style={{ width: "100%", fontSize: 11, minHeight: 60, resize: "vertical" }}
        />
        <button
          type="button"
          onClick={create}
          disabled={!title.trim() || !body.trim()}
          style={{ ...btnStyle, marginTop: 8, opacity: !title.trim() || !body.trim() ? 0.5 : 1 }}
        >
          Publish
        </button>
      </div>

      {/* List */}
      <div style={panelStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Body</th>
                <th style={thStyle}>Active</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={tdStyle}>{a.title}</td>
                  <td style={{ ...tdStyle, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.body}
                  </td>
                  <td style={{ ...tdStyle, color: a.is_active ? "var(--teal)" : "var(--ink-mute)" }}>
                    {a.is_active ? "YES" : "NO"}
                  </td>
                  <td style={tdStyle}>{fmtDate(a.created_at)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" onClick={() => toggle(a)} style={btnStyle}>
                        {a.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" onClick={() => remove(a.id)} style={dangerBtnStyle}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={total} size={20} onPage={load} />
      </div>
    </div>
  );
}
