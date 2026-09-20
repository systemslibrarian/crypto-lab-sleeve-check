/** Tiny DOM helpers. No framework; the point of this lab is inspectable output. */

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export const svg = (tag: string, attrs: Attrs = {}, children: Child[] = []): SVGElement => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
};

export const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export type VerdictTone = 'idle' | 'pass' | 'fail';

/**
 * A verdict line. Colour is never the only channel: every state carries a mark
 * glyph and a word (WCAG 1.4.1), and the region is a live status so a screen
 * reader hears the change.
 */
export function verdict(id: string): {
  node: HTMLElement;
  set(tone: VerdictTone, mark: string, body: (Node | string)[]): void;
  tone(): VerdictTone;
} {
  const mark = el('span', { class: 'verdict-mark', 'aria-hidden': 'true' });
  const body = el('span');
  const node = el('p', { class: 'verdict is-idle', id, role: 'status', 'aria-live': 'polite' }, [mark, body]);
  let current: VerdictTone = 'idle';
  return {
    node,
    set(tone, glyph, content) {
      current = tone;
      node.className = `verdict is-${tone}`;
      node.dataset.tone = tone;
      mark.textContent = glyph;
      clear(body);
      for (const c of content) body.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    },
    tone: () => current,
  };
}

/** A scrollable wrapper that meets the keyboard/label rules in template 4.2. */
export function scrollRegion(label: string, child: Node): HTMLElement {
  return el('div', { class: 'scroll-x', tabindex: '0', role: 'group', 'aria-label': label }, [child]);
}
