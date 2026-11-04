"use client";

/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
import { useEffect, useRef, type RefObject } from "react";

type ModalFocusOptions = {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement>;
  returnFocus?: (previous: HTMLElement | null) => HTMLElement | null;
};

const activeDialogs: HTMLElement[] = [];
let previousBodyOverflow = "";
const focusableSelector = "a[href], area[href], button, input:not([type='hidden']), select, textarea, iframe, summary, [tabindex], [contenteditable='true'], audio[controls], video[controls]";

export function isVisibleFocusTarget(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected
    && !element.matches(":disabled")
    && !element.closest("[hidden], [inert], [aria-hidden='true']")
    && element.getClientRects().length
    && getComputedStyle(element).visibility === "visible");
}

/** Initial focus, topmost-dialog containment and deliberate focus return/handoff. */
export function useModalFocus({ open, ...options }: ModalFocusOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeDialogs.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeDialogs.push(dialog);

    function tabbableElements() {
      return Array.from(dialog!.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.tabIndex >= 0 && isVisibleFocusTarget(element));
    }

    function focusInside() {
      const preferred = optionsRef.current.initialFocusRef?.current ?? null;
      const target = preferred && dialog!.contains(preferred) && isVisibleFocusTarget(preferred)
        ? preferred
        : tabbableElements()[0] ?? dialog!;
      target.focus({ preventScroll: true });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (activeDialogs.at(-1) !== dialog || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        optionsRef.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = tabbableElements();
      const first = elements[0];
      const last = elements.at(-1);
      const focused = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog!.focus({ preventScroll: true });
      } else if (!dialog!.contains(focused) || focused === dialog || !elements.includes(focused as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey ? focused === first : focused === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (activeDialogs.at(-1) === dialog && event.target instanceof Node && !dialog!.contains(event.target)) focusInside();
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn);
    focusInside();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn);
      const wasTopmost = activeDialogs.at(-1) === dialog;
      const index = activeDialogs.indexOf(dialog);
      if (index !== -1) activeDialogs.splice(index, 1);
      if (activeDialogs.length === 0) document.body.style.overflow = previousBodyOverflow;
      if (!wasTopmost) return;
      const target = optionsRef.current.returnFocus ? optionsRef.current.returnFocus(previousFocus) : previousFocus;
      if (isVisibleFocusTarget(target)) target.focus({ preventScroll: true });
    };
  }, [open]);

  return dialogRef;
}
