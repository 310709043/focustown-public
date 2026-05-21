"use client";

import { create } from "zustand";
import { authApi } from "../api/endpoints";
import type { User, VehicleRenderMeta } from "../api/types.gen";

export type SignUpInput = {
  email: string;
  password: string;
  displayName: string;
  termsVersion: string;
  marketingOptIn: boolean;
};

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
  setEquippedVehicle: (
    vehicleItemId: string | null,
    meta: VehicleRenderMeta | null,
  ) => void;
}

// Stable error codes the auth forms translate via `common.errors.*`. Backend
// ApiError instances already carry server-localised `message` text, so we
// pass that through unchanged; only client-side fallbacks (network failure,
// non-Error throws) need a code.
export const AUTH_ERROR_NETWORK_FAILURE = "networkFailure";
export const AUTH_ERROR_UNKNOWN = "unknown";

function describeAuthError(e: unknown): string {
  if (e instanceof TypeError) return AUTH_ERROR_NETWORK_FAILURE;
  if (e instanceof Error) return e.message;
  return AUTH_ERROR_UNKNOWN;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  async hydrate() {
    try {
      const me = await authApi.me();
      set({ user: me });
    } catch {
      set({ user: null });
    }
  },
  async signIn(email, password) {
    set({ loading: true, error: null });
    try {
      const user = await authApi.signIn({ email, password });
      set({ user, loading: false });
    } catch (e) {
      set({ loading: false, error: describeAuthError(e) });
      throw e;
    }
  },
  async signUp(input) {
    set({ loading: true, error: null });
    try {
      const user = await authApi.signUp({
        email: input.email,
        password: input.password,
        display_name: input.displayName,
        terms_accepted: true,
        terms_version: input.termsVersion,
        marketing_opt_in: input.marketingOptIn,
      });
      set({ user, loading: false });
    } catch (e) {
      set({ loading: false, error: describeAuthError(e) });
      throw e;
    }
  },
  signOut() {
    authApi.signOut();
    set({ user: null });
  },
  setEquippedVehicle(vehicleItemId, meta) {
    set((prev) =>
      prev.user
        ? {
            user: {
              ...prev.user,
              equipped_vehicle_item_id: vehicleItemId,
              equipped_vehicle: meta,
            },
          }
        : prev,
    );
  },
}));
