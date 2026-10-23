// Minimal clients for Meta's publishing APIs: Instagram (Instagram Login)
// and Threads. Both work in two steps: create a media container, wait until
// Meta has fetched and processed the media, then publish it.
//
// The token only travels in request bodies and query strings; nothing here
// logs a URL, and API errors are reduced to Meta's own message.

const IG_BASE = `https://graph.instagram.com/${process.env.META_API_VERSION ?? "v24.0"}`;
const THREADS_BASE = "https://graph.threads.net/v1.0";

export class MetaError extends Error {}

async function call(fetchImpl, method, base, path, token, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${base}${path}?${body}` : `${base}${path}`;
  const res = await fetchImpl(url, method === "GET" ? { method } : { method, body }).catch((err) => {
    throw new MetaError(`${method} ${path}: cannot reach ${new URL(base).host} (${err.cause?.code ?? err.message})`);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`;
    throw new MetaError(`${method} ${path}: ${msg}`);
  }
  return data;
}

/** Poll a container until Meta says it is ready (or failed). */
async function waitReady(get, field, { sleep, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const data = await get();
    const status = data[field];
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new MetaError(`container ${status}: ${data.error_message ?? data.status ?? "no detail"}`);
    }
    if (Date.now() > deadline) throw new MetaError(`container still ${status} after ${timeoutMs / 1000}s`);
    await sleep(intervalMs);
  }
}

const defaults = {
  fetchImpl: (...a) => fetch(...a),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs: 6 * 60_000,
  intervalMs: 5_000,
};

export function instagram(token, options = {}) {
  const o = { ...defaults, ...options };
  const req = (method, path, params) => call(o.fetchImpl, method, IG_BASE, path, token, params);
  let userId;

  const me = async () => {
    const data = await req("GET", "/me", { fields: "user_id,username" });
    userId = data.user_id ?? data.id;
    return { id: userId, username: data.username };
  };
  const container = async (params) => (await req("POST", `/${userId}/media`, params)).id;
  const publish = async (id) => {
    await waitReady(() => req("GET", `/${id}`, { fields: "status_code" }), "status_code", o);
    const { id: mediaId } = await req("POST", `/${userId}/media_publish`, { creation_id: id });
    const { permalink } = await req("GET", `/${mediaId}`, { fields: "permalink" });
    return { id: mediaId, permalink };
  };

  return {
    me,
    async reel({ videoUrl, coverUrl, caption, shareToFeed = true }) {
      const params = { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: String(shareToFeed) };
      if (coverUrl) params.cover_url = coverUrl;
      return publish(await container(params));
    },
    async image({ imageUrl, caption }) {
      return publish(await container({ image_url: imageUrl, caption }));
    },
    async carousel({ imageUrls, caption }) {
      const children = [];
      for (const url of imageUrls) children.push(await container({ image_url: url, is_carousel_item: "true" }));
      return publish(await container({ media_type: "CAROUSEL", children: children.join(","), caption }));
    },
  };
}

export function threads(token, options = {}) {
  const o = { ...defaults, ...options };
  const req = (method, path, params) => call(o.fetchImpl, method, THREADS_BASE, path, token, params);
  let userId;

  const me = async () => {
    const data = await req("GET", "/me", { fields: "id,username" });
    userId = data.id;
    return { id: userId, username: data.username };
  };
  const post = async (params) => {
    const { id } = await req("POST", `/${userId}/threads`, params);
    await waitReady(() => req("GET", `/${id}`, { fields: "status,error_message" }), "status", o);
    const { id: postId } = await req("POST", `/${userId}/threads_publish`, { creation_id: id });
    const { permalink } = await req("GET", `/${postId}`, { fields: "permalink" });
    return { id: postId, permalink };
  };

  return {
    me,
    async thread({ text, videoUrl, imageUrl, topicTag }) {
      const params = { text };
      if (videoUrl) Object.assign(params, { media_type: "VIDEO", video_url: videoUrl });
      else if (imageUrl) Object.assign(params, { media_type: "IMAGE", image_url: imageUrl });
      else params.media_type = "TEXT";
      if (topicTag) params.topic_tag = topicTag;
      return post(params);
    },
    async reply({ replyToId, text }) {
      return post({ media_type: "TEXT", text, reply_to_id: replyToId });
    },
  };
}
