import { NextResponse } from "next/server";
import { ADSENSE_PUB_ID, isAdsEnabled } from "@/lib/config/ads";

/** Serves /ads.txt — required by Google AdSense for domain verification.
 *  Returns 404 when ads are not configured so crawlers don't index a
 *  placeholder file. */
export function GET() {
  if (!isAdsEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = `google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
