"use client";

import { create } from "zustand";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastInput {
  kind: ToastKind;
  message: string;
  ttlMs?: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_TTL_MS: Record<ToastKind, number> = {
  error: 5000,
  info: 3000,
  success: 3000,
};

function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push({ kind, message, ttlMs }) {
    const id = nextId();
    const toast: Toast = { id, kind, message };
    set((prev) => ({ toasts: [...prev.toasts, toast] }));
    if (typeof window !== "undefined") {
      const delay = ttlMs ?? DEFAULT_TTL_MS[kind];
      window.setTimeout(() => get().dismiss(id), delay);
    }
    return id;
  },
  dismiss(id) {
    set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) }));
  },
  clear() {
    set({ toasts: [] });
  },
}));

export function pushErrorToast(message: string): string {
  return useToastStore.getState().push({ kind: "error", message });
}

export function pushSuccessToast(message: string): string {
  return useToastStore.getState().push({ kind: "success", message });
}

export function pushInfoToast(message: string): string {
  return useToastStore.getState().push({ kind: "info", message });
}
