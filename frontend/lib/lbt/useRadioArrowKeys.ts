import type { KeyboardEvent } from "react";

const ARROWS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];

/**
 * Arrow-key navigation for a `role="radiogroup"` made of `role="radio"`
 * buttons (roving tabindex). Attach to the group element's onKeyDown.
 */
export function onRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (!ARROWS.includes(event.key)) return;
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  if (options.length === 0) return;
  event.preventDefault();
  const current = options.findIndex(
    (option) => option.getAttribute("aria-checked") === "true",
  );
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const next = options[(current + step + options.length) % options.length];
  next.click();
  next.focus();
}
