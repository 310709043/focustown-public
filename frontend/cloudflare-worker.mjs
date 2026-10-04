import worker from "./.open-next/worker.js";
import cspHashes from "./.open-next/csp-hashes.json";

// Redirect before OpenNext handles images or Next.js routes.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "lowbatterytown.com") {
      url.protocol = "https:";
      url.hostname = "www.lowbatterytown.com";
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    const response = await worker.fetch(request, env, ctx);
    const hashes = cspHashes[url.pathname.replace(/\/+$/, "")];
    if (!hashes || !response.headers.get("Content-Type")?.includes("text/html") || response.status !== 200) return response;
    const headers = new Headers(response.headers);
    const csp = headers.get("Content-Security-Policy");
    if (!csp) return response;
    const nonce = crypto.randomUUID().replace(/-/g, "");
    headers.set("Content-Security-Policy", csp.replace(/script-src ([^;]*)/, (_match, sources) =>
      `script-src ${sources.replace(/'unsafe-inline'|'wasm-unsafe-eval'|https:\/\/cdn\.jsdelivr\.net/g, "")} 'nonce-${nonce}' ${hashes.join(" ")}`));
    // OpenNext transforms the bootstrap and RSC script chunking at runtime.
    // Stamp the trusted React-generated HTML after that transform, so header
    // and HTML agree without forcing dynamic Next.js rendering.
    headers.set("Cache-Control", "private, no-store");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.delete("ETag");
    headers.delete("Content-Length");
    headers.delete("x-csp-nonce");
    const secured = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    return new HTMLRewriter().on("script", {
      element(element) { element.setAttribute("nonce", nonce); },
    }).transform(secured);
  },
};
