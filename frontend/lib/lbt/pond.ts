/**
 * The koi pond offer: a paid home-stage scene, sold as a Buy Me a Coffee
 * extra and unlocked with a code the owner sends by e-mail (see /unlock and
 * edge/src/unlocks.ts). It is on sale only once POND_PURCHASE_URL is set;
 * until then nothing links to /unlock, the stage shows no locked chip and the
 * policy pages leave out the sections marked `pond`.
 *
 * Launching: set POND_PURCHASE_URL to the extra's page and bump
 * LBT_LEGAL.effectiveDate, since the terms and privacy pages change.
 */
export const POND_PURCHASE_URL: string | null = null;
export const POND_ON_SALE = POND_PURCHASE_URL !== null;

export const POND_OFFER = {
  priceUsd: 50,
  /** DEFAULT_MAX_DEVICES in edge/src/unlocks.ts. */
  devices: 3,
  /** How soon the owner promises to e-mail the code after payment. */
  codeHours: 24,
  /** Unused codes can be refunded within this many days of purchase. */
  refundDays: 7,
} as const;

export const POND_PREVIEW = { src: "/lbt/koi-pond-preview.webp", width: 1440, height: 1017 } as const;
