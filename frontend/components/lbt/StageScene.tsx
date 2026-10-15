"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { config } from "@/lib/config";
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
