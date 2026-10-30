// Tiny DOM helpers for the session viewer page: HTML and SVG elements from a tag, attributes and children.
type Child = Node | string | number | null | undefined | false
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>

const SVG_NS = 'http://www.w3.org/2000/svg'

function fill(el: Element, attrs: Attrs, children: Child[]): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener)
    else if (k === 'text') el.textContent = String(v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children.flat(Infinity as 1) as Child[]) {
    if (c === null || c === undefined || c === false) continue
    el.append(typeof c === 'object' ? c : document.createTextNode(String(c)))
  }
}

/** An HTML element. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  fill(el, attrs, children as Child[])
  return el
}

/** An SVG element. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  fill(el, attrs, children as Child[])
  return el
}

/** An SVG <title> (a native tooltip). */
export function tip(text: string): SVGTitleElement {
  return s('title', { text })
}

/** Replace an element's content. */
export function mount(el: Element, ...children: (Child | Child[])[]): void {
  el.replaceChildren()
  fill(el, {}, children as Child[])
}

export const FONT = `'Inter', 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif`

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

/** Text width in px at a font size (the page's sans-serif), cached. */
export function measure(text: string, size: number, weight = 400): number {
  const key = `${size}|${weight}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  ctx ??= document.createElement('canvas').getContext('2d')
  let w = text.length * size * 0.56
  if (ctx) {
    ctx.font = `${weight} ${size}px ${FONT}`
    w = ctx.measureText(text).width
  }
  cache.set(key, w)
  return w
}
