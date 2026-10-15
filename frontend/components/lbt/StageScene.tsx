"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/routing";
import { config } from "@/lib/config";
import { POND_ON_SALE } from "@/lib/lbt/pond";
import { useUnlocks } from "@/lib/lbt/unlocks";

/** The pond's code (canvas + WebGL) loads only when someone switches to it. */
const KoiPond = dynamic(() => import("./KoiPond"), { ssr: false });

export type StageScene = "town" | "pond";

const SCENE_KEY = "lbt-stage-scene";

/**
 * Which scene the home stage shows. The koi pond is a paid extra: the switch
 * appears only on a device that redeemed a code on /unlock (lib/lbt/unlocks),
 * and remembers the last choice there. Everyone else keeps the street and
 * never loads the pond. Server HTML is always the street; the choice applies
 * after mount.
 */
export function useStageScene(): { scene: StageScene; enabled: boolean; setScene: (scene: StageScene) => void } {
  const load = useUnlocks((s) => s.load);
  const enabled = useUnlocks((s) => s.items.includes("koi-pond"));
  const [chosen, setChosen] = useState<StageScene>("town");
  useEffect(() => {
    void load(config.apiBaseUrl);
    try {
      if (window.localStorage.getItem(SCENE_KEY) === "pond") setChosen("pond");
    } catch {
      /* no storage: start on the street */
    }
  }, [load]);
  const setScene = (scene: StageScene) => {
    setChosen(scene);
    try {
      window.localStorage.setItem(SCENE_KEY, scene);
    } catch {
      /* the choice lasts for this visit */
    }
  };
  return { scene: enabled ? chosen : "town", enabled, setScene };
}

export function StageSceneLayer({ scene }: { scene: StageScene }) {
  return scene === "pond" ? <KoiPond /> : null;
}

export function StageSceneToggle({ scene, setScene }: { scene: StageScene; setScene: (scene: StageScene) => void }) {
  const t = useTranslations("lbt.pond");
  return (
    <span className="stage-scene" role="radiogroup" aria-label={t("toggle")}>
      {(["town", "pond"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={scene === value}
          className={scene === value ? "is-on" : undefined}
          onClick={() => setScene(value)}
        >
          {t(value)}
        </button>
      ))}
    </span>
  );
}

/**
 * For a device without the pond, once it is on sale: the street stays on and
 * a locked 錦鯉池 chip leads to the offer on /unlock. Nothing before that.
 */
export function StageSceneOffer({ onSale = POND_ON_SALE }: { onSale?: boolean }) {
  const t = useTranslations("lbt.pond");
  // wait for this device's unlocks, so a buyer never sees the lock flash first
  const loaded = useUnlocks((s) => s.loaded);
  if (!onSale || !loaded) return null;
  return (
    <span className="stage-scene is-locked">
      <span className="is-on" aria-hidden="true">
        {t("town")}
      </span>
      <Link href="/unlock" aria-label={t("locked")}>
        {t("pond")}
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor" />
          <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </Link>
    </span>
  );
}
