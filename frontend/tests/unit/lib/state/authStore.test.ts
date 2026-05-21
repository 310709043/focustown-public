/**
 * authStore — auth flow façade over authApi.
 *
 * Worth testing:
 * - hydrate populates user when /me succeeds; silently clears it on
 *   failure (we don't want a failed me() check to crash the splash)
 * - signIn happy path stores user + clears loading
 * - signIn failure surfaces the localised error message + re-throws
 * - signUp happy path stores user
 * - signOut calls authApi.signOut and clears the user
 * - setEquippedVehicle patches only equipment fields, leaves other user fields alone
 * - setEquippedVehicle is a no-op when no user is hydrated (we won't synthesize a user from equipment)
 * - describeAuthError surfaces "無法連線" for TypeError (network failure)
 */
import { beforeEach, expect, test, vi } from "vitest";

import type { User, VehicleRenderMeta } from "@/lib/api/types.gen";

const me = vi.fn();
const signIn = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  authApi: {
    me: (...a: unknown[]) => me(...a),
    signIn: (...a: unknown[]) => signIn(...a),
    signUp: (...a: unknown[]) => signUp(...a),
    signOut: (...a: unknown[]) => signOut(...a),
  },
}));

import { useAuthStore } from "@/lib/state/authStore";

const alice: User = {
  id: "u-1",
  email: "alice@example.com",
  display_name: "Alice",
  character_key: null,
  role_label: null,
  marketing_opt_in: false,
  equipped_vehicle_item_id: null,
  equipped_vehicle: null,
};

beforeEach(() => {
  useAuthStore.setState({ user: null, loading: false, error: null });
  me.mockReset();
  signIn.mockReset();
  signUp.mockReset();
  signOut.mockReset();
});

test("hydrate stores user on success", async () => {
  me.mockResolvedValue(alice);

  await useAuthStore.getState().hydrate();

  expect(useAuthStore.getState().user).toEqual(alice);
});

test("hydrate clears user silently on failure (no crash on splash)", async () => {
  useAuthStore.setState({ user: alice });
  me.mockRejectedValue(new Error("401"));

  await useAuthStore.getState().hydrate();

  expect(useAuthStore.getState().user).toBeNull();
  // No error surfaced: hydrate is a soft check on app boot.
  expect(useAuthStore.getState().error).toBeNull();
});

test("signIn stores user + clears loading on success", async () => {
  signIn.mockResolvedValue(alice);

  await useAuthStore.getState().signIn("alice@example.com", "pw");

  expect(useAuthStore.getState().user).toEqual(alice);
  expect(useAuthStore.getState().loading).toBe(false);
});

test("signIn surfaces a localised error and re-throws on failure", async () => {
  signIn.mockRejectedValue(new TypeError("Failed to fetch"));

  await expect(
    useAuthStore.getState().signIn("alice@example.com", "pw"),
  ).rejects.toBeInstanceOf(TypeError);

  expect(useAuthStore.getState().error).toBe(
    "無法連線到伺服器，請確認後端服務已啟動",
  );
  expect(useAuthStore.getState().loading).toBe(false);
});

test("signIn surfaces backend error message verbatim for ApiError-like errors", async () => {
  signIn.mockRejectedValue(new Error("invalid_credentials"));

  await expect(
    useAuthStore.getState().signIn("a@b.c", "wrong"),
  ).rejects.toThrow();

  expect(useAuthStore.getState().error).toBe("invalid_credentials");
});

test("signUp stores user on success", async () => {
  signUp.mockResolvedValue(alice);

  await useAuthStore.getState().signUp({
    email: alice.email,
    password: "pw",
    displayName: "Alice",
    termsVersion: "2026-05-14",
    marketingOptIn: false,
  });

  expect(useAuthStore.getState().user).toEqual(alice);
});

test("signUp re-throws on failure", async () => {
  signUp.mockRejectedValue(new Error("email_taken"));

  await expect(
    useAuthStore.getState().signUp({
      email: alice.email,
      password: "pw",
      displayName: "Alice",
      termsVersion: "2026-05-14",
      marketingOptIn: false,
    }),
  ).rejects.toThrow("email_taken");

  expect(useAuthStore.getState().error).toBe("email_taken");
});

test("signOut clears user and calls authApi.signOut", () => {
  useAuthStore.setState({ user: alice });

  useAuthStore.getState().signOut();

  expect(signOut).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().user).toBeNull();
});

test("setEquippedVehicle patches equipment fields, leaves other user fields", () => {
  useAuthStore.setState({ user: alice });
  const meta: VehicleRenderMeta = {
    icon: "🚗",
    body_color: "#abc",
    roof_color: "#def",
  };

  useAuthStore.getState().setEquippedVehicle("ui-veh-1", meta);

  const u = useAuthStore.getState().user;
  expect(u?.equipped_vehicle_item_id).toBe("ui-veh-1");
  expect(u?.equipped_vehicle).toEqual(meta);
  expect(u?.email).toBe(alice.email);
  expect(u?.display_name).toBe(alice.display_name);
});

test("setEquippedVehicle is a no-op when no user is hydrated", () => {
  useAuthStore.getState().setEquippedVehicle("ui-veh-1", null);

  expect(useAuthStore.getState().user).toBeNull();
});
