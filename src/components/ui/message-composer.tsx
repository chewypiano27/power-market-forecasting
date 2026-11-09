import { type ReactNode, type RefObject } from "react";
import { type TextareaRenderable } from "../../ui";

export interface MessageComposerProps {
  inputRef?: RefObject<TextareaRenderable | null>;
  initialValue?: string;
  focused?: boolean;
  placeholder?: string;
  width?: number | string;
  height?: number | string;
  terminalPrefix?: string;
  terminalDivider?: boolean;
  terminalBottomInset?: number;
  onFocusRequest?: () => void;
  onInput?: (value: string) => void;
  onCursorChange?: () => void;
  onSubmit?: () => void;
  keyBindings?: Array<Record<string, unknown>>;
  wrapText?: boolean;
  /**
   * Desktop and web: a control at the end of the field, such as an attach
   * button. The terminal draws only the field.
   */
  accessory?: ReactNode;
}
