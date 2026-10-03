"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Link } from "@/i18n/routing";
import { useLbtStore } from "@/lib/lbt/sessionStore";

import { ChatView } from "./ChatView";
import { EndView } from "./EndView";
import { HomeView } from "./HomeView";
import { LocaleToggle } from "./LocaleToggle";
import { ModalHost } from "./ModalHost";
import { WaitingView } from "./WaitingView";

import "./lbt.css";

/**
 * LowBatteryTown front end: home → waiting → chat → end, all simulated.
 * There is no matching service, account or payment behind it.
 */
export function LbtApp({ fontClassName = "" }: { fontClassName?: string }) {
  const t = useTranslations("lbt");
  const view = useLbtStore((s) => s.view);
  const goHome = useLbtStore((s) => s.goHome);
  const openModal = useLbtStore((s) => s.openModal);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Leaving the page must not leave timers running.
  useEffect(() => () => useLbtStore.getState().reset(), []);

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
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              lowbattery<span className="brand-town">town</span>
              <span className="brand-dot">.</span>
            </span>
          </Link>
          <div className="topbar-actions">
            <span className="prototype-pill">
              <span className="prototype-dot" />
              {t("topbar.prototype")}
            </span>
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
          <span>{t("footer.right")}</span>
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
