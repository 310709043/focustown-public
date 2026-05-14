"use client";

import Link from "next/link";

/**
 * Rendered when the API returns 404 for an unknown room id. Kept dead
 * simple — a single emoji + one-line message — so it can't be mistaken
 * for a permission-denied state.
 */
export function MissingRoom() {
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div className="font-japan text-muted text-center">
        <div style={{ fontSize: 28 }}>🚪</div>
        <div style={{ fontSize: 13, marginTop: 10 }}>找不到這間房</div>
        <Link
          href="/town"
          className="font-japan text-amber hover:text-text transition-colors"
          style={{ fontSize: 12, marginTop: 16, display: "inline-block" }}
        >
          ◂ 回街景
        </Link>
      </div>
    </main>
  );
}
