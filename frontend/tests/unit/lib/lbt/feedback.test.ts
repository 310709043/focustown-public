/**
 * Feedback client — posts to the API, trims, sends a null e-mail when left
 * empty, and turns failures into known codes.
 */
import { expect, test, vi } from "vitest";

import { FeedbackError, submitFeedback } from "@/lib/lbt/feedback";

const INPUT = {
  category: "idea" as const,
  message: "  多一點夜景  ",
  email: "  ",
  website: "",
  page: "/zh-TW",
  locale: "zh-TW",
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("posts the trimmed submission to the feedback endpoint", async () => {
  const fetchImpl = fakeFetch(201, { id: "f1" });
  const id = await submitFeedback("https://api.example/", INPUT, fetchImpl);
  expect(id).toBe("f1");
  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.example/api/v1/lbt/feedback");
  expect(JSON.parse(String(init.body))).toEqual({
    category: "idea",
    message: "多一點夜景",
    email: null,
    website: "",
    page: "/zh-TW",
    locale: "zh-TW",
  });
});

test("passes the API error code through when it is a known one", async () => {
  const fetchImpl = fakeFetch(429, { error: { code: "too_many_feedback" } });
  await expect(submitFeedback("https://api.example", INPUT, fetchImpl)).rejects.toMatchObject({
    code: "too_many_feedback",
  });
});

test("maps an unknown error to `unknown`", async () => {
  const fetchImpl = fakeFetch(500, { error: { code: "boom" } });
  await expect(submitFeedback("https://api.example", INPUT, fetchImpl)).rejects.toMatchObject({ code: "unknown" });
});

test("maps a network failure to `network`", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  const err = await submitFeedback("https://api.example", INPUT, fetchImpl).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(FeedbackError);
  expect((err as FeedbackError).code).toBe("network");
});
