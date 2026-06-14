"use client";

import { useEffect } from "react";

function getLang(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.startsWith("zh") ? "zh" : "en";
}

const COPY: Record<string, { title: string; desc: string; button: string }> = {
  zh: {
    title: "發生未預期的狀況",
    desc: "頁面發生錯誤，請重新載入。",
    button: "重新載入",
  },
  en: {
    title: "Something went wrong",
    desc: "An unexpected error occurred. Please reload the page.",
    button: "Reload",
  },
};

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

  const lang = getLang();
  const copy = COPY[lang];

  return (
    <html lang={lang === "zh" ? "zh-TW" : "en"}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c1020",
          color: "#f4ecd8",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
            {copy.title}
          </h1>
          <p
            style={{
              fontSize: "1rem",
              color: "#b8b4cc",
              marginBottom: "1.5rem",
            }}
          >
            {copy.desc}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "6px",
              background: "#a78bfa",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            {copy.button}
          </button>
        </div>
      </body>
    </html>
  );
}
