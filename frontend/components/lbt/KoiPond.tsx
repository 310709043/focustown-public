"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { KOI_KINDS, mountKoiPond, type KoiKind, type KoiPond as Pond } from "@/lib/lbt/koiPond.mjs";

/**
 * The koi pond as the home stage's scene (see lib/lbt/koiPond.mjs). Loaded
 * only when the visitor switches to it, so the street stays the default and
 * costs nothing extra. The tray drops a koi of each variety into the pond.
 */
export default function KoiPond() {
  const t = useTranslations("lbt.pond");
  const host = useRef<HTMLDivElement>(null);
  const [pond, setPond] = useState<Pond | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mounted = mountKoiPond(el, { reducedMotion, onCount: setCount });
    setPond(mounted);
    return () => {
      mounted.destroy();
      setPond(null);
    };
  }, []);

  return (
    <div className="koi-pond">
      <div className="koi-host" ref={host} />
      <div className="koi-tint" aria-hidden="true" />
      <div className="koi-scrim" aria-hidden="true" />
      <div className="koi-tray" role="group" aria-label={t("trayLabel")}>
        <div className="koi-kinds">
          {KOI_KINDS.map((kind) => (
            <KoiButton key={kind} kind={kind} pond={pond} name={t(`kinds.${kind}`)} label={t("add", { name: t(`kinds.${kind}`) })} />
          ))}
        </div>
        <p className="koi-meta">
          <span>{t("count", { count })}</span>
          <span>{t("hint")}</span>
        </p>
      </div>
    </div>
  );
}

function KoiButton({ kind, pond, name, label }: { kind: KoiKind; pond: Pond | null; name: string; label: string }) {
  const icon = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (pond && icon.current) pond.drawIcon(kind, icon.current);
  }, [pond, kind]);
  return (
    <button type="button" className="koi-kind" aria-label={label} disabled={!pond} onClick={() => pond?.addFish(kind)}>
      <canvas ref={icon} width={144} height={60} aria-hidden="true" />
      <b>{name}</b>
    </button>
  );
}
