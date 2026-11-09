import { type ReactNode } from "react";

export interface PageStackViewProps {
  focused: boolean;
  detailOpen: boolean;
  onBack: () => void;
  rootContent: ReactNode;
  detailContent: ReactNode;
  detailTitle?: string;
  /** @deprecated Omit it; the back control will always read "Back". */
  backLabel?: string;
  /** @deprecated Omit it; stack headers will not draw a trailing hint. */
  backHint?: string;
}
