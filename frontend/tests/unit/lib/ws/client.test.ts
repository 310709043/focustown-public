/**
 * RealtimeClient — connect / dispatch / reconnect semantics.
 *
 * Worth testing:
 * - connect() with no token is a no-op (avoids hammering the server while
 *   the user is signed out)
 * - onmessage parses JSON and fans out to every listener; malformed JSON
 *   is swallowed silently (and listeners are NOT called for it)
 * - disconnect() prevents the auto-reconnect path
 * - on() returns an unsubscribe that actually removes the listener
 *
 * NOT worth testing:
 * - The exponential-backoff arithmetic — covered by the WebSocket mock's
 *   reconnect setTimeout in any reasonable browser; pinning the exact
 *   delay sequence would just couple to implementation.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { tokenStore } from "@/lib/api/client";
import { RealtimeClient } from "@/lib/ws/client";

class MockSocket {
  public static last: MockSocket;
  public readyState = 0;
  public sent: string[] = [];
  public onopen?: () => void;
  public onmessage?: (e: { data: string }) => void;
  public onclose?: () => void;
  public onerror?: () => void;

  constructor(public readonly url: string) {
    MockSocket.last = this;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitRaw(raw: string) {
    this.onmessage?.({ data: raw });
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("WebSocket", MockSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("connect with no token is a no-op", () => {
  const client = new RealtimeClient();
  client.connect();
  expect(MockSocket.last).toBeUndefined();
});

test("dispatches parsed messages to every listener", () => {
  tokenStore.save({ access_token: "t", refresh_token: "r" });
  const client = new RealtimeClient();
  const seen: unknown[] = [];
  client.on((m) => seen.push(m));
  client.on((m) => seen.push({ second: m }));
  client.connect();

  MockSocket.last.open();
  MockSocket.last.emit({ type: "chat", room_id: "r1", from: "u1", text: "hi" });

  expect(seen).toHaveLength(2);
});

test("malformed JSON is swallowed silently (no listener called)", () => {
  tokenStore.save({ access_token: "t", refresh_token: "r" });
  const client = new RealtimeClient();
  const listener = vi.fn();
  client.on(listener);
  client.connect();

  MockSocket.last.open();
  MockSocket.last.emitRaw("not json");

  expect(listener).not.toHaveBeenCalled();
});

test("on() returns an unsubscribe that removes the listener", () => {
  tokenStore.save({ access_token: "t", refresh_token: "r" });
  const client = new RealtimeClient();
  const listener = vi.fn();
  const off = client.on(listener);
  off();
  client.connect();

  MockSocket.last.open();
  MockSocket.last.emit({ type: "any" });

  expect(listener).not.toHaveBeenCalled();
});

test("disconnect() suppresses the auto-reconnect path", () => {
  tokenStore.save({ access_token: "t", refresh_token: "r" });
  const client = new RealtimeClient();
  client.connect();
  const firstSocket = MockSocket.last;

  client.disconnect();
  firstSocket.close();

  // No new socket should have been opened after disconnect.
  expect(MockSocket.last).toBe(firstSocket);
});
