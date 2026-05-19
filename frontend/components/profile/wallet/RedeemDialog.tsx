"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/modals/Modal";
import { ApiError } from "@/lib/api/client";
import { walletApi } from "@/lib/api/endpoints";
import { useWalletStore } from "@/lib/state/walletStore";

interface RedeemDialogProps {
  open: boolean;
  onClose: () => void;
}

type DialogState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; amount: number; balance: number }
  | { kind: "error"; msg: string };

function mapError(t: (k: string) => string, err: unknown): string {
  if (!(err instanceof ApiError)) return t("errorGeneric");
  if (err.status === 404) return t("errorNotFound");
  if (err.status === 409) return t("errorUsed");
  if (err.status === 422) return t("errorExhausted");
  return t("errorGeneric");
}

export function RedeemDialog({ open, onClose }: RedeemDialogProps) {
  const t = useTranslations("profile.wallet.redeem");
  const setBalance = useWalletStore((s) => s.setBalance);
  const [code, setCode] = useState("");
  const [state, setState] = useState<DialogState>({ kind: "idle" });

  const close = () => {
    setCode("");
    setState({ kind: "idle" });
    onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;
    const trimmed = code.trim();
    if (!trimmed) {
      setState({ kind: "error", msg: t("emptyError") });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await walletApi.redeem(trimmed);
      // Optimistic local update; the WS push will reconcile if it diverges.
      setBalance(res.currency_code, res.balance_after_minor);
      setState({
        kind: "success",
        amount: Math.round(res.amount_minor / 100),
        balance: Math.round(res.balance_after_minor / 100),
      });
    } catch (err) {
      setState({ kind: "error", msg: mapError(t, err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("title")}
      accent="var(--accent-3)"
      width="min(440px, 92vw)"
      testId="wallet-redeem-dialog"
    >
      {state.kind === "success" ? (
        <div
          className="font-silkscreen"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            padding: "12px 4px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 28 }} aria-hidden>
            ✦
          </span>
          <div style={{ fontSize: 13, letterSpacing: "0.25em", color: "var(--accent-3)" }}>
            {t("successHeading")}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-mute)", lineHeight: 1.6 }}>
            {t("successBody", { amount: state.amount, balance: state.balance })}
          </div>
          <button
            type="button"
            onClick={close}
            className="pixel-btn"
            style={{ padding: "8px 16px", fontSize: 11, letterSpacing: "0.25em" }}
          >
            {t("cancelCta")}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "4px 2px",
          }}
        >
          <p
            className="font-silkscreen"
            style={{
              margin: 0,
              fontSize: 11,
              lineHeight: 1.7,
              letterSpacing: "0.16em",
              color: "var(--ink-mute)",
            }}
          >
            {t("subtitle")}
          </p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("placeholder")}
            className="pixel-input"
            autoFocus
            maxLength={40}
          />
          {state.kind === "error" ? (
            <div
              className="font-silkscreen"
              style={{ fontSize: 11, color: "#f472b6", letterSpacing: "0.18em" }}
            >
              {state.msg}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={close}
              className="font-silkscreen"
              style={{
                padding: "8px 14px",
                fontSize: 10,
                letterSpacing: "0.22em",
                color: "var(--ink-mute)",
                background: "transparent",
                border: "1px solid var(--panel-stroke)",
                cursor: "pointer",
              }}
            >
              {t("cancelCta")}
            </button>
            <button
              type="submit"
              disabled={state.kind === "submitting"}
              className="pixel-btn font-silkscreen disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                padding: "8px 18px",
                fontSize: 11,
                letterSpacing: "0.25em",
                background: "var(--accent)",
                borderColor: "var(--accent)",
                color: "#0c0524",
              }}
            >
              {state.kind === "submitting" ? t("submittingCta") : t("submitCta")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
