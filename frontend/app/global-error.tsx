"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "<no-digest>");
  }, [error]);

  return (
    <html lang="zh-TW">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030111",
          color: "#e2d9f3",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
            發生未預期的狀況
          </h1>
          <p
            lang="en"
            style={{
              fontSize: "1rem",
              color: "#7c6fa0",
              marginBottom: "1.5rem",
            }}
          >
            Something went wrong. Please reload the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "6px",
              background: "#7c3aed",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            重新載入 / Reload
          </button>
        </div>
      </body>
    </html>
  );
}
