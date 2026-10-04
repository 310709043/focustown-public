import { expect, test } from "vitest";
import { SUPPORT_PAGE_URL, SUPPORT_REFUND_URL } from "@/lib/lbt/support";

test("support goes to the approved creator profile over HTTPS", () => {
  const url = new URL(SUPPORT_PAGE_URL);
  expect(url.protocol).toBe("https:");
  expect(url.hostname).toBe("buymeacoffee.com");
  expect(url.pathname).toBe("/lowbatterytown");
  expect(new URL(SUPPORT_REFUND_URL).hostname).toBe("help.buymeacoffee.com");
});
