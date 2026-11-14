"use client";

/**
 * Paid looks beyond the koi pond: 下雨的小鎮 (rain on the home street) and
 * four style packs that restyle every screen (home, waiting, chat, end).
 * Like the pond they are unlocked with a code (lib/lbt/unlocks); the device
 * remembers which owned look is switched on, and <html data-lbt-theme>
 * carries the style to the CSS in lbt.css. Cosmetic only: nothing here
 * touches matching or chat.
 *
 * The offer is in lib/lbt/looksOffer.ts; until it is on sale nothing links
 * to the looks, and the owner can preview them in a dev build with ?rain=1
 * or ?theme=<style>.
 */
import { useEffect } from "react";
import { create } from "zustand";

import { config } from "@/lib/config";

import { RAIN_ITEM, STYLE_ITEM, STYLES, type StyleId } from "./looksOffer";
import { useUnlocks, type UnlockItem } from "./unlocks";

export { LOOKS_OFFER, LOOKS_ON_SALE, LOOKS_PURCHASE_URL, RAIN_ITEM, STYLE_ITEM, STYLES, type StyleId } from "./looksOffer";

const KEY = "lbt-looks";

/** What the visitor switched on. null = not chosen yet: an owned look is on. */
interface Choice {
  style: StyleId | "original" | null;
  rain: boolean | null;
}

const isStyle = (v: unknown): v is StyleId => (STYLES as readonly unknown[]).includes(v);

function readChoice(): Choice {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Choice> | null;
    return {
      style: isStyle(raw?.style) || raw?.style === "original" ? raw.style : null,
      rain: typeof raw?.rain === "boolean" ? raw.rain : null,
    };
  } catch {
    return { style: null, rain: null };
  }
}

function writeChoice(choice: Choice) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

interface LooksState {
  choice: Choice;
  /** Dev-only preview from the URL: shows a look without owning it. */
  preview: { style: StyleId | null; rain: boolean };
  hydrated: boolean;
  hydrate: (search?: string) => void;
  setStyle: (style: StyleId | "original") => void;
  setRain: (on: boolean) => void;
}

export const useLooks = create<LooksState>((set, get) => ({
  choice: { style: null, rain: null },
  preview: { style: null, rain: false },
  hydrated: false,
  hydrate(search = typeof window === "undefined" ? "" : window.location.search) {
    if (get().hydrated) return;
    const preview = { style: null as StyleId | null, rain: false };
    if (process.env.NODE_ENV !== "production") {
      const params = new URLSearchParams(search);
      const theme = params.get("theme");
      preview.style = isStyle(theme) ? theme : null;
      preview.rain = params.get("rain") === "1";
    }
    set({ choice: readChoice(), preview, hydrated: true });
  },
  setStyle(style) {
    const choice = { ...get().choice, style };
    writeChoice(choice);
    set({ choice, preview: { ...get().preview, style: null } });
  },
  setRain(on) {
    const choice = { ...get().choice, rain: on };
    writeChoice(choice);
    set({ choice, preview: { ...get().preview, rain: false } });
  },
}));

export interface EffectiveLooks {
  ownsRain: boolean;
  ownedStyles: StyleId[];
  rain: boolean;
  style: StyleId | null;
}

/** Owned looks and the ones switched on (pure, for tests). */
export function effectiveLooks(items: readonly UnlockItem[], choice: Choice, preview: LooksState["preview"]): EffectiveLooks {
  const ownsRain = items.includes(RAIN_ITEM);
  const ownedStyles = STYLES.filter((s) => items.includes(STYLE_ITEM[s]));
  const chosen =
    choice.style === "original" ? null : choice.style && ownedStyles.includes(choice.style) ? choice.style : (ownedStyles[0] ?? null);
  return {
    ownsRain,
    ownedStyles,
    rain: preview.rain || (ownsRain && choice.rain !== false),
    style: preview.style ?? chosen,
  };
}

export function useEffectiveLooks(): EffectiveLooks {
  const items = useUnlocks((s) => s.items);
  const choice = useLooks((s) => s.choice);
  const preview = useLooks((s) => s.preview);
  return effectiveLooks(items, choice, preview);
}

/**
 * Once per app: read the device's unlocks and choice, then keep
 * <html data-lbt-theme> in step with the style that is on.
 */
export function useApplyLooks() {
  const hydrate = useLooks((s) => s.hydrate);
  const load = useUnlocks((s) => s.load);
  const { style } = useEffectiveLooks();
  useEffect(() => {
    hydrate();
    void load(config.apiBaseUrl);
  }, [hydrate, load]);
  useEffect(() => {
    const root = document.documentElement;
    if (style) root.dataset.lbtTheme = style;
    else delete root.dataset.lbtTheme;
  }, [style]);
}
