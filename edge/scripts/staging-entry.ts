/** Capacity-only entrypoint. Never used by edge/wrangler.jsonc. */
import api, { TownObject } from "../src/index";
import type { Env } from "../src/config";
import { sameSecret } from "../src/security";

export { TownObject };
export interface CapacityEnv extends Env {
  LBT_CAPACITY_MODE?: string;
  LBT_CAPACITY_KEY?: string;
}

export default {
  async fetch(request: Request, env: CapacityEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Fail closed: even an accidentally deployed wrapper cannot expose chat.
    if (env.LBT_CAPACITY_MODE !== "isolated" || !env.LBT_CAPACITY_KEY ||
        env.LBT_CAPACITY_KEY.length < 32 ||
        !url.hostname.startsWith("lbt-capacity-") || !url.hostname.endsWith(".workers.dev")) {
      return new Response(null, { status: 503 });
    }
    if (!(await sameSecret(request.headers.get("X-LBT-Capacity-Key") ?? "", env.LBT_CAPACITY_KEY))) {
      return new Response(null, { status: 403 });
    }
    if (!["/healthz", "/api/v1/lbt/status", "/api/v1/lbt/guest", "/api/v1/lbt/ws"].includes(url.pathname)) {
      return new Response(null, { status: 404 });
    }
    const ip = request.headers.get("X-LBT-Capacity-IP") ?? "";
    if (!/^2001:db8::[a-f0-9]{1,3}$/.test(ip)) return new Response(null, { status: 400 });
    // Authenticated synthetic visitors only, in a separate namespace/database.
    // This models independent IPs; it does not test real NAT/anti-abuse limits.
    const headers = new Headers(request.headers);
    headers.set("CF-Connecting-IP", ip);
    headers.delete("X-LBT-Capacity-Key");
    headers.delete("X-LBT-Capacity-IP");
    return api.fetch(new Request(request, { headers }), env, ctx);
  },
};
