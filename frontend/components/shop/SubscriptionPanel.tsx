"use client";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import { CornerDeco } from "@/components/login/CornerDeco";
import { pushInfoToast } from "@/lib/state/toastStore";

const FEATURES: Array<{ label: string; free: boolean; plus: boolean }> = [
  { label: "番茄計時器 & 基本統計", free: true, plus: true },
  { label: "Lofi 音樂電台", free: true, plus: true },
  { label: "配對專注夥伴", free: true, plus: true },
  { label: "排行榜", free: true, plus: true },
  { label: "無限番茄歷史記錄", free: false, plus: true },
  { label: "進階音樂庫 (全部曲目)", free: false, plus: true },
  { label: "房間裝飾 & 主題", free: false, plus: true },
  { label: "去除廣告", free: false, plus: true },
  { label: "獨特像素角色皮膚", free: false, plus: true },
];

export function SubscriptionPanel() {
  function handleUpgrade() {
    pushInfoToast("敬請期待！Focus+ 功能開發中 🔋");
  }

  return (
    <section
      data-testid="shop-subscription"
      className="pixel-panel"
      style={{
        position: "relative",
        padding: "20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <CornerDeco color="var(--accent-2)" />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3
          className="font-silkscreen"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "var(--accent-2)",
            textShadow: "0 0 8px var(--accent-2)",
            margin: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <BlinkDot color="var(--accent-2)" marginRight={6} />
          FOCUS+ 訂閱方案
        </h3>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            color: "var(--accent-2)",
            border: "1px solid var(--accent-2)",
            padding: "2px 8px",
            textShadow: "0 0 6px var(--accent-2)",
          }}
        >
          PREMIUM
        </span>
      </div>

      {/* Pricing row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--font-vt323), monospace",
            fontSize: 28,
            color: "var(--amber)",
            textShadow: "0 0 8px rgba(252,211,77,0.45)",
            letterSpacing: 1,
          }}
        >
          NT$129
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-mute)" }}
        >
          / 月
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)", marginLeft: 4 }}
        >
          (免費方案永久可用)
        </span>
      </div>

      {/* Feature comparison table */}
      <div
        style={{
          border: "1px solid var(--panel-stroke)",
          overflow: "hidden",
        }}
      >
        {/* Table header */}
        <div
          className="font-silkscreen"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 56px 56px",
            padding: "6px 10px",
            background: "rgba(20,10,55,0.7)",
            borderBottom: "1px solid var(--panel-stroke)",
            fontSize: 9,
            letterSpacing: "0.2em",
            color: "var(--ink-mute)",
          }}
        >
          <span>功能</span>
          <span style={{ textAlign: "center", color: "var(--ink-dim)" }}>FREE</span>
          <span style={{ textAlign: "center", color: "var(--accent-2)", textShadow: "0 0 6px var(--accent-2)" }}>FOCUS+</span>
        </div>

        {FEATURES.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 56px 56px",
              padding: "7px 10px",
              borderBottom: i < FEATURES.length - 1 ? "1px solid var(--panel-stroke)" : "none",
              background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.2)",
              alignItems: "center",
            }}
          >
            <span
              className="font-silkscreen"
              style={{
                fontSize: 10,
                color: f.free ? "var(--ink)" : "var(--ink-mute)",
                letterSpacing: "0.06em",
              }}
            >
              {f.label}
            </span>
            <span
              className="font-silkscreen"
              style={{
                textAlign: "center",
                fontSize: 12,
                color: f.free ? "var(--teal)" : "var(--ink-dim)",
                textShadow: f.free ? "0 0 6px var(--teal)" : "none",
              }}
            >
              {f.free ? "✓" : "—"}
            </span>
            <span
              className="font-silkscreen"
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--accent-2)",
                textShadow: "0 0 6px var(--accent-2)",
              }}
            >
              ✓
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={handleUpgrade}
        className="pixel-btn primary font-silkscreen"
        style={{
          fontSize: 11,
          padding: "10px 16px",
          letterSpacing: "0.22em",
          background: "var(--accent-2)",
          borderColor: "var(--accent-2)",
          color: "#0c0524",
          cursor: "pointer",
          textShadow: "none",
        }}
      >
        ✦ 立即升級 FOCUS+
      </button>
    </section>
  );
}
