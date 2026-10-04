"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Elements Tab can actually land on. A radio group is a single tab stop
 * (its checked option, or the first when none is checked), so the other
 * radios must not count as the "last" element or Tab would escape.
 */
function tabStops(dialog: HTMLElement): HTMLElement[] {
  const all = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  return all.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== "radio") return true;
    const group = all.filter(
      (other): other is HTMLInputElement =>
        other instanceof HTMLInputElement &&
        other.type === "radio" &&
        other.name === el.name,
    );
    const stop = group.find((radio) => radio.checked) ?? group[0];
    return el === stop;
  });
}

interface LbtModalProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose: () => void;
}

/**
 * Accessible dialog: focus moves in on open, Tab stays inside, Escape and
 * the backdrop close it, and focus returns to whatever opened it.
 */
export function LbtModal({
  eyebrow,
  title,
  children,
  confirmLabel,
  confirmDisabled = false,
  onConfirm,
  secondaryLabel,
  onSecondary,
  onClose,
}: LbtModalProps) {
  const t = useTranslations("lbt.modal");
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = tabStops(dialog);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          ref={closeRef}
          type="button"
          className="modal-close"
          aria-label={t("close")}
          onClick={onClose}
        >
          ×
        </button>
        <span className="small-label">{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
        <div>{children}</div>
        <button
          type="button"
          className="primary-button"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel} <span aria-hidden="true">↗</span>
        </button>
        {secondaryLabel && onSecondary ? (
          <button type="button" className="secondary-button" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
      </section>
    </div>
  );
}
