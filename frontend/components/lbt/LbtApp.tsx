"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Link } from "@/i18n/routing";
import { config } from "@/lib/config";
import { STATUS_POLL_MS } from "@/lib/lbt/constants";
import { createDemoTransport } from "@/lib/lbt/demoTransport";
import { createLiveTransport } from "@/lib/lbt/liveTransport";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import type { LbtTransport } from "@/lib/lbt/transport";
import type { LbtMode } from "@/lib/lbt/types";

import { Wordmark } from "./BrandMark";
import { ChatView } from "./ChatView";
import { EndView } from "./EndView";
import { HomeView } from "./HomeView";
import { IntroSplash } from "./IntroSplash";
import { LocaleToggle } from "./LocaleToggle";
import { ModalHost } from "./ModalHost";
import { WaitingView } from "./WaitingView";

import "./lbt.css";

function defaultTransport(mode: LbtMode): LbtTransport {
  return mode === "demo"
    ? createDemoTransport()
    : createLiveTransport({ apiBaseUrl: config.apiBaseUrl, wsBaseUrl: config.wsBaseUrl });
}

interface LbtAppProps {
  fontClassName?: string;
  /** `live` (default) pairs real people via the backend; `demo` runs the labelled script. */
  mode?: LbtMode;
  /** Override the transport (tests, the static prototype build). */
  createTransport?: () => LbtTransport;
}

/**
 * LowBatteryTown: home → waiting → chat → end. In live mode a real person
 * is matched by the backend; in demo mode the partner is a labelled script.
 * Payments stay off until approved checkout links exist.
 */
export function LbtApp({ fontClassName = "", mode = "live", createTransport }: LbtAppProps) {
  const t = useTranslations("lbt");
  const view = useLbtStore((s) => s.view);
  const storeMode = useLbtStore((s) => s.mode);
  const goHome = useLbtStore((s) => s.goHome);
  const openModal = useLbtStore((s) => s.openModal);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const transportRef = useRef<LbtTransport | null>(null);

  // Connect on mount; leaving the page closes the socket and stops timers.
  useEffect(() => {
    const transport = createTransport ? createTransport() : defaultTransport(mode);
    transportRef.current = transport;
    const detach = useLbtStore.getState().attach(transport);
    return () => {
      detach();
      transportRef.current = null;
      useLbtStore.getState().reset();
    };
  }, [mode, createTransport]);

  // Real head count, refreshed while the tab is visible.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const transport = transportRef.current;
      if (!transport || document.hidden) return;
      const status = await transport.status();
      if (!cancelled) useLbtStore.getState().setTown(status);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), STATUS_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    // Our own connection counts too: refresh as soon as it opens so the
    // first number shown already includes this visitor.
    const unsubscribe = useLbtStore.subscribe((state, prev) => {
      if (state.connection === "open" && prev.connection !== "open") void refresh();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [mode, createTransport]);

  // New view: back to the top, and move focus to its heading so screen
  // readers announce it. The chat view focuses its own composer.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    rootRef.current?.scrollTo?.({ top: 0 });
    if (view !== "chat") {
      rootRef.current?.querySelector<HTMLElement>("main h1")?.focus();
    }
  }, [view]);

  return (
    <div ref={rootRef} className={`lbt ${fontClassName}`.trim()}>
      <IntroSplash tagline={`${t("home.titleTop")}${t("home.titleEm")}`} />
      <div className="site-shell">
        <header className="topbar">
          <Link
            className="brand"
            href="/"
            aria-label={t("brand.homeAria")}
            onClick={(event) => {
              event.preventDefault();
              goHome();
            }}
          >
            <Wordmark />
          </Link>
          <div className="topbar-actions">
            <button
              type="button"
              className="prototype-pill feedback-pill"
              onClick={() => openModal({ type: "feedback" })}
            >
              <span className="prototype-dot" aria-hidden="true" />
              {t("topbar.feedback")}
            </button>
            <LocaleToggle />
            <button
              type="button"
              className="text-button"
              onClick={() => openModal({ type: "about" })}
            >
              {t("topbar.guide")} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>

        {view === "home" ? <HomeView /> : null}
        {view === "waiting" ? <WaitingView /> : null}
        {view === "chat" ? <ChatView /> : null}
        {view === "end" ? <EndView /> : null}

        <footer className="footer">
          <span>{t("footer.left")}</span>
          <span>{storeMode === "demo" ? t("footer.right") : t("footer.rightLive")}</span>
          <nav className="footer-links" aria-label={t("policy.nav.aria")}>
            <Link href="/guide">{t("guide.nav")}</Link>
            <Link href="/policies/privacy">{t("policy.nav.privacy")}</Link>
            <Link href="/policies/terms">{t("policy.nav.terms")}</Link>
            <Link href="/policies/guidelines">{t("policy.nav.guidelines")}</Link>
          </nav>
          <button
            type="button"
            className="text-button footer-guide"
            onClick={() => openModal({ type: "about" })}
          >
            {t("topbar.guide")} <span aria-hidden="true">↗</span>
          </button>
        </footer>
      </div>
      <ModalHost />
    </div>
  );
}
