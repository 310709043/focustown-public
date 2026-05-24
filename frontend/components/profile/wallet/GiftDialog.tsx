"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/modals/Modal";
import { ApiError } from "@/lib/api/client";
import { walletApi } from "@/lib/api/endpoints";
import { useWalletStore } from "@/lib/state/walletStore";

interface GiftDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional pre-filled recipient (e.g. opened from a friend row).
   *  When supplied, the recipient input is locked-and-displayed so
   *  the friend can't be accidentally retargeted. */
  prefilledRecipient?: string | null;
}

type DialogState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; amount: number; balance: number }
  | { kind: "error"; msg: string };

const MIN_T = 1;
const MAX_T = 1000;

function mapError(t: (k: string) => string, err: unknown): string {
  if (!(err instanceof ApiError)) return t("errorGeneric");
  if (err.status === 404) return t("errorRecipient");
  if (err.status === 402) return t("errorInsufficient");
  if (err.status === 422) return t("errorAmount");
  if (err.status === 400) return t("errorSelf");
  return t("errorGeneric");
}

export function GiftDialog({
  open,
  onClose,
  prefilledRecipient = null,
}: GiftDialogProps) {
  const t = useTranslations("profile.wallet.gift");
  const setBalance = useWalletStore((s) => s.setBalance);
  const [recipient, setRecipient] = useState(prefilledRecipient ?? "");
  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<DialogState>({ kind: "idle" });

  // Re-sync the recipient whenever the dialog is re-opened with a new
  // pre-fill (e.g. user clicks gift on a different friend).
  useEffect(() => {
    if (open) setRecipient(prefilledRecipient ?? "");
  }, [open, prefilledRecipient]);

  const close = () => {
    setRecipient(prefilledRecipient ?? "");
    setAmount("10");
    setMessage("");
    setState({ kind: "idle" });
    onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;
    const id = recipient.trim();
    const amountT = Number(amount);
    if (!id) {
      setState({ kind: "error", msg: t("errorRecipient") });
      return;
    }
    if (!Number.isFinite(amountT) || amountT < MIN_T || amountT > MAX_T) {
      setState({ kind: "error", msg: t("errorAmount") });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `gift-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await walletApi.gift({
        recipient_user_id: id,
        amount_minor: Math.round(amountT * 100),
        message: message.trim() || null,
        idempotencyKey,
      });
      setBalance("T", res.balance_after_minor);
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
      accent="var(--accent-2)"
      width="min(480px, 92vw)"
      testId="wallet-gift-dialog"
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
            🎁
          </span>
          <div style={{ fontSize: 13, letterSpacing: "0.25em", color: "var(--accent-2)" }}>
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
            gap: 10,
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

          <label
            className="font-silkscreen"
            style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-mute)" }}
          >
            {t("recipientLabel")}
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={t("recipientPlaceholder")}
            className="pixel-input"
            maxLength={36}
            autoFocus
            readOnly={prefilledRecipient != null}
            style={
              prefilledRecipient != null
                ? { opacity: 0.75, cursor: "not-allowed" }
                : undefined
            }
          />

          <label
            className="font-silkscreen"
            style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-mute)" }}
          >
            {t("amountLabel")}
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("amountPlaceholder")}
            className="pixel-input"
            min={MIN_T}
            max={MAX_T}
          />

          <label
            className="font-silkscreen"
            style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-mute)" }}
          >
            {t("messageLabel")}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
            rows={2}
            className="pixel-input"
            maxLength={200}
            style={{ resize: "vertical" }}
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
                background: "var(--accent-2)",
                borderColor: "var(--accent-2)",
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
