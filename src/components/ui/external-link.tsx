import { createContext, useContext, useEffect, useRef } from "react";

interface PaneLinkEntry {
  key: string;
  label: string;
  open: () => void;
}

const PaneLinkMenuContext = createContext<((entry: PaneLinkEntry) => () => void) | null>(null);

/**
 * Puts an inline link or badge in the nearest `PaneLinkMenu`. `key` names what
 * it opens, so the same link twice is listed once; `null` leaves it out.
 */
export function usePaneLinkMenuEntry(key: string | null, label: string, open: () => void): void {
  const register = useContext(PaneLinkMenuContext);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!register || !key) return;
    return register({ key, label, open: () => openRef.current() });
  }, [key, label, register]);
}
