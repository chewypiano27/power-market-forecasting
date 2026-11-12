import { getLanguage, subscribeLanguage, translateUiText } from ".";

const ATTRIBUTES = ["title", "placeholder", "aria-label"];
const SKIP = 'script, style, pre, code, [contenteditable="true"], [translate="no"], [data-power-translate="no"]';
type Copy = { original: string; rendered: string };

/** Translate existing text nodes without replacing React-owned elements or input values. */
export function translateWorkstation(root: HTMLElement): () => void {
  const records = new WeakMap<Node, Map<string, Copy>>();
  const update = (node: Node, key: string, value: string, write: (value: string) => void) => {
    let copies = records.get(node);
    if (!copies) records.set(node, copies = new Map());
    const previous = copies.get(key);
    const original = previous?.rendered === value ? previous.original : value;
    const rendered = translateUiText(original, getLanguage());
    copies.set(key, { original, rendered });
    if (rendered !== value) write(rendered);
  };
  const visit = (node: Node) => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element || element.closest(SKIP)) return;
    if (node.nodeType === 3) {
      update(node, "text", node.nodeValue ?? "", value => { node.nodeValue = value; });
    } else if (node.nodeType === 1) {
      for (const key of ATTRIBUTES) {
        const value = element.getAttribute(key);
        if (value !== null) update(node, key, value, next => element.setAttribute(key, next));
      }
      for (const child of node.childNodes) visit(child);
    }
  };
  const pending = new Set<Node>();
  let queued = false;
  let active = true;
  const schedule = (node: Node) => {
    pending.add(node);
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!active) return;
      for (const node of pending) if (root.contains(node)) visit(node);
      pending.clear();
    });
  };
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") for (const node of mutation.addedNodes) schedule(node);
      else schedule(mutation.target);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  const unsubscribe = subscribeLanguage(() => visit(root));
  visit(root);
  return () => { active = false; observer.disconnect(); unsubscribe(); pending.clear(); };
}
