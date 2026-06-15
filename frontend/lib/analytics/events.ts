/** GA4 custom event helpers.
 *
 *  Each function is a no-op when analytics are disabled (gtag not loaded).
 *  Call these from components / stores to track key user actions.
 */

type GtagParams = Record<string, string | number | boolean>;

function gtag(command: string, ...args: unknown[]) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  w.gtag?.(command, ...args);
}

/** Track a custom event. */
function trackEvent(name: string, params?: GtagParams) {
  gtag("event", name, params);
}

// ── Pre-defined events ───────────────────────────────────────────────────

export function trackSignUp(method: string = "email") {
  trackEvent("sign_up", { method });
}

export function trackSignIn(method: string = "email") {
  trackEvent("login", { method });
}

export function trackFocusStart(mode: string, durationSeconds: number) {
  trackEvent("focus_start", { mode, duration_seconds: durationSeconds });
}

export function trackFocusComplete(mode: string, durationSeconds: number, coinsEarned: number) {
  trackEvent("focus_complete", {
    mode,
    duration_seconds: durationSeconds,
    coins_earned: coinsEarned,
  });
}

export function trackRoomJoin(roomId: string) {
  trackEvent("room_join", { room_id: roomId });
}

export function trackMatchStart() {
  trackEvent("match_start");
}

export function trackShopPurchase(itemId: string, price: number) {
  trackEvent("shop_purchase", { item_id: itemId, price });
}

export function trackPageView(path: string) {
  gtag("config", process.env.NEXT_PUBLIC_GA_ID ?? "", { page_path: path });
}
