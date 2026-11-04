import { useEffect, useRef } from "react";

/** Enhance visible-by-default markup; reveal each item once as it enters the viewport. */
export function useScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;

    const reveal = (item: HTMLElement, immediate = false) => {
      if (immediate) item.setAttribute("data-reveal-immediate", "");
      item.dataset.revealState = "visible";
      observer?.unobserve(item);
    };
    const revealAll = () => {
      items.forEach((item) => reveal(item, true));
      observer?.disconnect();
    };

    // Server-rendered content and browsers without observation always stay readable.
    if (!preference.matches && "IntersectionObserver" in window) {
      try {
        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) reveal(entry.target as HTMLElement);
            });
          },
          { rootMargin: "0px 0px -48px 0px", threshold: 0.06 },
        );
        items.forEach((item) => {
          // Never hide content already on screen, above it, or reached via a deep link.
          if (item.getBoundingClientRect().top < window.innerHeight - 48) {
            reveal(item, true);
          } else {
            item.dataset.revealState = "pending";
            observer?.observe(item);
          }
        });
      } catch {
        revealAll();
      }
    }

    const onPreferenceChange = () => {
      if (preference.matches) revealAll();
    };
    const onFocus = (event: FocusEvent) => {
      // A keyboard user can tab directly into an offscreen card without finding it hidden.
      if (!(event.target instanceof Node)) return;
      const target = event.target;
      items.forEach((item) => {
        if (item.contains(target)) reveal(item, true);
      });
    };
    preference.addEventListener("change", onPreferenceChange);
    root.addEventListener("focusin", onFocus);

    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", onPreferenceChange);
      root.removeEventListener("focusin", onFocus);
      items.forEach((item) => {
        item.removeAttribute("data-reveal-state");
        item.removeAttribute("data-reveal-immediate");
      });
    };
  }, []);

  return rootRef;
}
