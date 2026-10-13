import { useEffect } from "react";

let activeLocks = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";
let previousBodyPaddingRight = "";
let pageScrollStyles: Array<{ element: HTMLElement; overflow: string }> = [];

export const useBodyScrollLock = (locked: boolean) => {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    const { body, documentElement } = document;

    if (activeLocks === 0) {
      previousBodyOverflow = body.style.overflow;
      previousHtmlOverflow = documentElement.style.overflow;
      previousBodyPaddingRight = body.style.paddingRight;

      const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
      body.style.overflow = "hidden";
      documentElement.style.overflow = "hidden";
      pageScrollStyles = Array.from(document.querySelectorAll<HTMLElement>("[data-page-scroll]")).map(element => ({ element, overflow: element.style.overflow }));
      pageScrollStyles.forEach(({ element }) => { element.style.overflow = "hidden"; });

      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);

      if (activeLocks === 0) {
        body.style.overflow = previousBodyOverflow;
        documentElement.style.overflow = previousHtmlOverflow;
        body.style.paddingRight = previousBodyPaddingRight;
        pageScrollStyles.forEach(({ element, overflow }) => { element.style.overflow = overflow; });
        pageScrollStyles = [];
      }
    };
  }, [locked]);
};
