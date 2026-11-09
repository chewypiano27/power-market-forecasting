/** @jsxImportSource react */
import type { CSSProperties, ReactNode } from "react";
import {
  StyledText,
  type StyledTextChunk,
  type TextProps,
} from "../../../ui/host";
import { mouseHandlers } from "./mouse";
import { cleanDomProps, textStyle } from "./style";

function isStyledTextContent(value: unknown): value is { chunks: StyledTextChunk[] } {
  return value instanceof StyledText
    || (!!value && typeof value === "object" && Array.isArray((value as { chunks?: unknown }).chunks));
}

function styledTextChunkStyle(baseProps: TextProps, chunk: StyledTextChunk): CSSProperties {
  const style = textStyle({
    ...baseProps,
    fg: typeof chunk.fg === "string" ? chunk.fg : baseProps.fg,
    bg: typeof chunk.bg === "string" ? chunk.bg : baseProps.bg,
    attributes: chunk.attributes,
  });
  style.display = "inline";
  style.width = undefined;
  style.maxWidth = undefined;
  style.minWidth = undefined;
  style.flexShrink = undefined;
  return style;
}

function renderTextContent(children: ReactNode, content: TextProps["content"], baseProps: TextProps): ReactNode {
  const resolved = children ?? content;
  if (!isStyledTextContent(resolved)) return resolved as ReactNode;
  return resolved.chunks.map((chunk, index) => (
    <span
      key={index}
      style={styledTextChunkStyle(baseProps, chunk)}
    >
      {chunk.text}
    </span>
  ));
}

export function WebText({ children, ...props }: TextProps) {
  return (
    <span
      {...cleanDomProps(props)}
      {...mouseHandlers(props)}
      style={{ ...textStyle(props), ...(props.style as CSSProperties | undefined) }}
    >
      {renderTextContent(children, props.content, props)}
    </span>
  );
}

export function WebSpan({ children, ...props }: TextProps) {
  return (
    <span {...cleanDomProps(props)} {...mouseHandlers(props)} style={{ ...textStyle(props), ...(props.style as CSSProperties | undefined) }}>
      {children as ReactNode}
    </span>
  );
}

export function WebStrong({ children, ...props }: TextProps) {
  return (
    <strong {...cleanDomProps(props)} style={{ ...textStyle({ ...props, bold: true }), ...(props.style as CSSProperties | undefined) }}>
      {children as ReactNode}
    </strong>
  );
}

export function WebUnderline({ children, ...props }: TextProps) {
  return (
    <span {...cleanDomProps(props)} style={{ ...textStyle({ ...props, underline: true }), ...(props.style as CSSProperties | undefined) }}>
      {children as ReactNode}
    </span>
  );
}
