"use client";

import Link from "next/link";

/**
 * Rendered when the API returns 403 for a room the caller does not own.
 * Phase 8 will replace this with a real visitor experience; until then we
 * show an engraved "ROOM LOCKED" plaque that matches the OwnerPlaque
 * visual language so the gate feels native to the world.
 */
export function LockedRoom({ roomId }: { roomId: string }) {
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div
        className="text-center font-japan animate-plaqueFlicker"
        style={{
          padding: "18px 26px 16px",
          background:
            "linear-gradient(180deg, rgba(34,17,42,0.95), rgba(20,9,30,0.95))",
          boxShadow: [
            "0 0 0 1px #b97f3a inset",
            "0 0 0 3px #1a0e22 inset",
            "0 2px 0 0 #b97f3a",
          ].join(", "),
          color: "#ffd9a8",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <div
          className="font-pixel"
          style={{ fontSize: 12, letterSpacing: 1.5, marginBottom: 6 }}
        >
          ROOM LOCKED
        </div>
        <div
          className="font-mono text-muted"
          style={{ fontSize: 12, letterSpacing: 0.8 }}
        >
          訪客機制 Phase 8 啟用
        </div>
        <div
          className="font-mono text-muted"
          style={{ fontSize: 10, marginTop: 6, opacity: 0.6 }}
        >
          id: {roomId.slice(0, 8)}…
        </div>
        <div style={{ marginTop: 14 }}>
          <Link
            href="/town"
            className="font-japan text-amber hover:text-text transition-colors"
            style={{ fontSize: 12 }}
          >
            ◂ 回街景
          </Link>
        </div>
      </div>
    </main>
  );
}
