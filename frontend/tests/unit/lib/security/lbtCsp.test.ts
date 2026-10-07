import { describe, expect, it } from "vitest";

import { buildLbtCsp } from "@/lib/security/lbtCsp";
import { isLbtPublicRoute } from "@/lib/security/lbtRoutes.mjs";

const prod = buildLbtCsp({
  nonce: "n",
  prod: true,
  apiHttp: "https://api.lowbatterytown.com",
  apiWs: "wss://api.lowbatterytown.com",
});
const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("LowBatteryTown CSP", () => {
  it("allows the chat API and Cloudflare analytics only", () => {
    expect(directive(prod, "connect-src")).toBe(
      "connect-src 'self' https://api.lowbatterytown.com wss://api.lowbatterytown.com https://cloudflareinsights.com",
    );
  });

  it("carries none of the legacy allowances", () => {
    expect(prod).not.toMatch(/jsdelivr|googleapis|youtube|googlesyndication|google-analytics|wasm-unsafe-eval/);
  });

  it("forbids frames, plugins and framing", () => {
    expect([directive(prod, "frame-src"), directive(prod, "object-src"), directive(prod, "frame-ancestors")]).toEqual([
      "frame-src 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ]);
  });

  it("keeps 'unsafe-inline' in production for the edge to swap for a nonce", () => {
    expect(directive(prod, "script-src")).toBe("script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com");
  });
});

describe("LowBatteryTown routes", () => {
  it.each(["/zh-TW", "/en", "/zh-TW/demo", "/en/guide", "/zh-TW/guide/cant-sleep", "/en/policies/privacy"])(
    "%s is a LowBatteryTown page",
    (path) => expect(isLbtPublicRoute(path)).toBe(true),
  );

  it.each(["/zh-TW/town", "/en/signin", "/zh-TW/policies/refund", "/zh-TW/guide/a/b", "/zh"])(
    "%s is not",
    (path) => expect(isLbtPublicRoute(path)).toBe(false),
  );
});
