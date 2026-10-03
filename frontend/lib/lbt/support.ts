import { SUPPORT_AMOUNTS } from "./constants";
import type { SupportAmount } from "./types";

/**
 * Payment-provider checkout links for the single-payment "light a lamp"
 * support tiers. Intentionally empty: the buttons stay disabled until the
 * operator has an approved payment provider, a published operator
 * identity, a contact address and payment/refund terms. Add only official
 * fixed-amount https links here.
 */
export const SUPPORT_CHECKOUT_LINKS: Readonly<Record<SupportAmount, string>> = {
  60: "",
  150: "",
  300: "",
};

export function isSupportAmount(value: number): value is SupportAmount {
  return (SUPPORT_AMOUNTS as readonly number[]).includes(value);
}

/** Returns the checkout URL for an amount, or null while payment is off. */
export function getCheckoutUrl(
  amount: SupportAmount,
  links: Readonly<Record<SupportAmount, string>> = SUPPORT_CHECKOUT_LINKS,
): string | null {
  const link = links[amount];
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
