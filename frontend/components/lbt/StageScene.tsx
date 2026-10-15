"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** The pond's code (canvas + WebGL) loads only when someone switches to it. */
const KoiPond = dynamic(() => import("./KoiPond"), { ssr: false });

export type StageScene = "town" | "pond";

/**
 * Which scene the home stage shows. Preview for the owner: the switch only
 * appears with `?scene=pond` (or `?scene=town`) in the address, so ordinary
 * visitors keep the street and never load the pond. Server HTML is always
 * the street; the choice applies after mount.
 */
export function useStageScene(): { scene: StageScene; enabled: boolean; setScene: (scene: StageScene) => void } {
  const [enabled, setEnabled] = useState(false);
  const [scene, setScene] = useState<StageScene>("town");
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("scene");
    if (asked === "pond" || asked === "town") {
      setEnabled(true);
      setScene(asked);
    }
  }, []);
  return { scene, enabled, setScene };
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
