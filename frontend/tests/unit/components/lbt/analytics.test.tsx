import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LbtAnalytics } from "@/components/analytics/LbtAnalytics";
import { analyticsReferrer, lbtAnalyticsPath } from "@/lib/analytics/lbtPageViews";

const navigation = vi.hoisted(() => ({ pathname: "/zh-TW" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next-intl", () => ({ useTranslations: () => () => "Allow Google Analytics" }));
vi.mock("@/lib/analytics/lbtPageViews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/lbtPageViews")>()),
  LBT_GA_ID: "G-TEST123",
}));

const browser = window as Window & {
  lbtAnalyticsDataLayer?: IArguments[];
  "ga-disable-G-TEST123"?: boolean;
};
const analyticsScript = 'script[src^="https://www.googletagmanager.com/"]';

function pageViews() {
  return browser.lbtAnalyticsDataLayer?.map((args) => Array.from(args))
    .filter(([command, name]) => command === "event" && name === "page_view");
}

beforeEach(() => {
  window.localStorage.clear();
  navigation.pathname = "/zh-TW";
  window.history.replaceState({}, "", "/zh-TW?token=test-only#code=test-only");
});

afterEach(() => {
  cleanup();
  document.querySelector(analyticsScript)?.remove();
  delete browser.lbtAnalyticsDataLayer;
  delete browser["ga-disable-G-TEST123"];
});

describe("LowBatteryTown Google Analytics", () => {
  it("loads only on opt-in, redacts the URL and stops on opt-out", () => {
    render(<LbtAnalytics />);
    const consent = screen.getByRole("checkbox");
    expect(consent).not.toBeChecked();
    expect(document.querySelector(analyticsScript)).toBeNull();

    fireEvent.click(consent);
    expect(consent).toBeChecked();
    expect(document.querySelectorAll(analyticsScript)).toHaveLength(1);
    const commands = browser.lbtAnalyticsDataLayer?.map((args) => Array.from(args));
    expect(commands?.[0]).toEqual(["set", expect.objectContaining({
      page_location: `${window.location.origin}/zh-TW`,
    })]);
    expect(commands?.[1]).toEqual(["set", expect.objectContaining({
      send_page_view: false,
      allow_google_signals: false,
    })]);
    expect(pageViews()).toEqual([["event", "page_view", expect.objectContaining({
      page_location: `${window.location.origin}/zh-TW`,
      send_to: "G-TEST123",
    })]]);

    fireEvent.click(consent);
    expect(browser["ga-disable-G-TEST123"]).toBe(true);
    expect(pageViews()).toHaveLength(1);
  });

  it("counts a new guide page but does not count chat and return-to-home states", () => {
    const { rerender } = render(<LbtAnalytics />);
    fireEvent.click(screen.getByRole("checkbox"));
    rerender(<LbtAnalytics active={false} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(browser["ga-disable-G-TEST123"]).toBe(true);
    rerender(<LbtAnalytics />);
    expect(pageViews()).toHaveLength(1);

    navigation.pathname = "/en/guide/social-battery";
    rerender(<LbtAnalytics />);
    expect(pageViews()).toHaveLength(2);
    expect(document.querySelectorAll(analyticsScript)).toHaveLength(1);
  });

  it("excludes unknown pages, unlock and legacy routes, and keeps only the referrer origin", () => {
    expect(lbtAnalyticsPath("/zh-TW/guide/unknown")).toBeNull();
    expect(lbtAnalyticsPath("/en/unlock")).toBeNull();
    expect(lbtAnalyticsPath("/en/town")).toBeNull();
    expect(analyticsReferrer("https://example.com/private?token=secret#hash")).toBe("https://example.com");
  });
});
