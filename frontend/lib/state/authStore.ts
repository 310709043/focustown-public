"use client";

import { create } from "zustand";
import { authApi } from "../api/endpoints";
import type { User } from "../api/types.gen";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => void;
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
      set({ loading: false, error: (e as Error).message });
      throw e;
    }
  },
  async signUp(email, password, displayName) {
    set({ loading: true, error: null });
    try {
      const user = await authApi.signUp({ email, password, display_name: displayName });
      set({ user, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
      throw e;
    }
  },
  signOut() {
    authApi.signOut();
    set({ user: null });
  },
}));
