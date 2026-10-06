import { useLayoutEffect, useRef } from "react";

const focusableSelector =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
const backgrounds = new Map<
  HTMLElement,
  { count: number; wasInert: boolean }
>();
const dialogs: HTMLElement[] = [];
let originalOverflow = "";
let originalFocus: HTMLElement | null = null;

export function useModalFocus(onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    const opener = returnFocus.current;
    if (!overlay || !dialog) return;
    if (dialogs.length === 0) {
      originalOverflow = document.body.style.overflow;
      originalFocus = opener;
      document.body.style.overflow = "hidden";
    }
    dialogs.push(dialog);
    const siblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay,
    );
    // Reference counts preserve background locks when nested dialogs close together.
    for (const element of siblings) {
      const state = backgrounds.get(element) ?? {
        count: 0,
        wasInert: element.inert,
      };
      state.count++;
      backgrounds.set(element, state);
      element.inert = true;
    }
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0);
    const focusFirst = () =>
      (focusable()[0] ?? dialog).focus({ preventScroll: true });
    if (!dialog.contains(document.activeElement)) focusFirst();
    const onKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const elements = focusable();
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (
          !elements.length ||
          (event.shiftKey
            ? index <= 0
            : index < 0 || index === elements.length - 1)
        ) {
          event.preventDefault();
          (event.shiftKey
            ? (elements.at(-1) ?? dialog)
            : (elements[0] ?? dialog)
          ).focus();
        }
      }
    };
    const onFocus = () => {
      if (dialogs.at(-1) === dialog && !dialog.contains(document.activeElement))
        focusFirst();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      dialogs.splice(dialogs.indexOf(dialog), 1);
      for (const element of siblings) {
        const state = backgrounds.get(element)!;
        if (--state.count === 0) {
          element.inert = state.wasInert;
          backgrounds.delete(element);
        }
      }
      const target = dialogs.length ? opener : originalFocus;
      if (!dialogs.length) document.body.style.overflow = originalOverflow;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  return { overlayRef, dialogRef };
}
