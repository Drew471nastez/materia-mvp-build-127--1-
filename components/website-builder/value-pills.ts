/**
 * ===========================================================================
 *  SHOP DATA IN A SENTENCE, AS ONE PIECE
 * ===========================================================================
 * "Welcome to {{ shop.name }}" is saved as exactly that string. While it is
 * edited, the placeholder is a small grey pill that says "Shop name": the
 * caret steps over it in one press, Backspace and Delete take it out whole,
 * a click on it offers another value or Remove, and a copy carries the
 * placeholder, so a paste anywhere in the builder comes back as the pill.
 *
 * Every text box that holds shop data uses these helpers: the one line and
 * long text boxes (editor/controls/chip-text-input.tsx), the rich text editor
 * (rich-text-field.tsx) and the heading editor
 * (editor/controls/inline-richtext-control.tsx). One pill, one set of keys.
 *
 * WHY TYPING USED TO STOP. A pill is `contenteditable="false"`. When it was
 * the last thing in its line there was no text after it for the caret to sit
 * in, so Chrome and Safari put the caret before it or nowhere, and letters
 * typed after the pill went missing. A pill is therefore always followed by
 * a text node; when nothing else is there it is a zero width space, which
 * every reader of these fields strips before the value is saved.
 */
import { dynamicSource } from "@/lib/storelib-theme/dynamic"
import { tt } from "@/lib/i18n/text"

export const ZWSP = "​"
const ZW_ALL = /​/g

export const stripZw = (s: string) => s.replace(ZW_ALL, "")

/** The pill's look. Inline, so the markup a rich text field holds carries it without a stylesheet. */
export const PILL_STYLE =
  "display:inline-block;padding:0 6px;margin:0 1px;border-radius:6px;background:#eceef1;color:#374151;font-size:0.92em;font-weight:500;line-height:1.5;white-space:nowrap;max-width:100%;vertical-align:baseline;cursor:pointer;-webkit-tap-highlight-color:transparent"

/** What a value is called on its pill: a known source by its own name, anything else by its last two words. */
export function pillLabel(expr: string): string {
  const id = expr.split("|")[0].trim()
  const known = dynamicSource(id)
  if (known) return tt(known.label)
  const path = id.split(".").filter((p) => p && p !== "closest" && p !== "settings")
  const words = path.slice(-2).join(" ").replace(/_/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : expr
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

/** The pill as markup, for a field whose DOM is written from a string. */
export function pillHtml(expr: string): string {
  const label = pillLabel(expr)
  return `<span data-value="${escapeAttr(expr)}" contenteditable="false" role="button" aria-haspopup="listbox" aria-label="${escapeAttr(tt("{label}, shop data", { label }))}" style="${PILL_STYLE}">${escapeAttr(label)}</span>`
}

/** The pill as a node. */
export function pillNode(expr: string): HTMLElement {
  const label = pillLabel(expr)
  const el = document.createElement("span")
  el.dataset.value = expr
  el.contentEditable = "false"
  el.setAttribute("role", "button")
  el.setAttribute("aria-haspopup", "listbox")
  el.setAttribute("aria-label", tt("{label}, shop data", { label }))
  el.setAttribute("style", PILL_STYLE)
  el.textContent = label
  return el
}

export function isPill(n: Node | null | undefined): n is HTMLElement {
  return !!n && n.nodeType === 1 && (n as HTMLElement).hasAttribute("data-value") && (n as HTMLElement).getAttribute("contenteditable") === "false"
}

/** The editable box a node is in. */
export function editableOf(n: Node | null): HTMLElement | null {
  const el = n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)
  return (el?.closest('[contenteditable]:not([contenteditable="false"])') as HTMLElement | null) ?? null
}

const onlyZw = (n: Node | null) => !!n && n.nodeType === 3 && stripZw(n.textContent ?? "") === ""

/**
 * A text node after every pill, so the caret has somewhere to be. Only where
 * there is none: a pill followed by words already has one.
 */
export function ensureCaretRoom(root: HTMLElement) {
  for (const pill of root.querySelectorAll<HTMLElement>('[data-value][contenteditable="false"]')) {
    const next = pill.nextSibling
    if (next && next.nodeType === 3 && (next.textContent ?? "") !== "") continue
    pill.after(document.createTextNode(ZWSP))
  }
}

/** Typed or pasted `{{ ... }}` among the words becomes its pill, in place. Returns the last pill made. */
export function pillsFromText(root: HTMLElement, pattern: RegExp, accept: (expr: string) => boolean = () => true): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n.textContent ?? "").includes("{{") && !isPill(n.parentElement)) hits.push(n as Text)
  }
  let last: HTMLElement | null = null
  for (const text of hits) {
    const value = text.textContent ?? ""
    const re = new RegExp(pattern.source, "g")
    const parts: (string | HTMLElement)[] = []
    let at = 0
    for (const m of value.matchAll(re)) {
      const expr = m[1].trim()
      if (!accept(expr)) continue
      const start = m.index ?? 0
      if (start > at) parts.push(value.slice(at, start))
      const pill = pillNode(expr)
      parts.push(pill)
      last = pill
      at = start + m[0].length
    }
    if (parts.length === 0) continue
    if (at < value.length) parts.push(value.slice(at))
    text.replaceWith(...parts)
  }
  if (last) ensureCaretRoom(root)
  return last
}

/** The caret right after a pill, past the space that holds its place. */
export function caretAfter(pill: HTMLElement) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const next = pill.nextSibling
  if (next && next.nodeType === 3) range.setStart(next, (next.textContent ?? "").startsWith(ZWSP) ? 1 : 0)
  else range.setStartAfter(pill)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

function caretBefore(pill: HTMLElement) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const prev = pill.previousSibling
  if (prev && prev.nodeType === 3) {
    const t = prev.textContent ?? ""
    /* Before the place holder of a pill in front, never between it and its pill. */
    range.setStart(prev, t.length)
  } else range.setStartBefore(pill)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** The pill right beside a collapsed caret, on one side, counting a place holder space as nothing. */
export function pillBeside(root: HTMLElement, dir: -1 | 1): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
  const node = sel.anchorNode
  const off = sel.anchorOffset
  if (!node || !root.contains(node)) return null
  let sib: Node | null
  if (node.nodeType === 3) {
    const t = node.textContent ?? ""
    if (stripZw(dir === 1 ? t.slice(off) : t.slice(0, off)) !== "") return null
    sib = dir === 1 ? node.nextSibling : node.previousSibling
  } else {
    sib = dir === 1 ? node.childNodes[off] ?? null : node.childNodes[off - 1] ?? null
  }
  while (sib && onlyZw(sib)) sib = dir === 1 ? sib.nextSibling : sib.previousSibling
  return isPill(sib) ? sib : null
}

/** Tell the field its DOM changed, the way typing does, so it reads and saves itself. */
export function announceInput(root: HTMLElement, inputType = "insertText") {
  root.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }))
}

/** A pill out, with the space that held its place. */
export function removePill(pill: HTMLElement) {
  const root = editableOf(pill.parentNode)
  const next = pill.nextSibling
  const prev = pill.previousSibling
  if (next && next.nodeType === 3 && (next.textContent ?? "").startsWith(ZWSP)) {
    next.textContent = (next.textContent ?? "").slice(1)
    if (next.textContent === "") next.remove()
  }
  const sel = window.getSelection()
  const range = document.createRange()
  if (prev && prev.isConnected) {
    if (prev.nodeType === 3) range.setStart(prev, (prev.textContent ?? "").length)
    else range.setStartAfter(prev)
  } else range.setStartBefore(pill)
  pill.remove()
  if (root) ensureCaretRoom(root)
  if (sel && root && document.activeElement === root) {
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
  if (root) announceInput(root, "deleteContentBackward")
}

/** One pill for another, where it stood. */
export function replacePill(pill: HTMLElement, expr: string): HTMLElement {
  const root = editableOf(pill.parentNode)
  const next = pillNode(expr)
  pill.replaceWith(next)
  if (root) {
    ensureCaretRoom(root)
    announceInput(root)
  }
  return next
}

/** Where a new pill goes when the field never had a caret: the end of its last line, inside the line. */
function endOf(root: HTMLElement): Range {
  let node: Node = root
  while (node.lastChild && node.lastChild.nodeType === 1 && !isPill(node.lastChild) && (node.lastChild as HTMLElement).tagName !== "BR") node = node.lastChild
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  return range
}

/**
 * A new pill at the caret the field last had, or at its end. Done on the DOM
 * and announced as input, so it works without focusing the field (focus on a
 * phone would raise the keyboard over the sheet).
 */
export function insertPill(root: HTMLElement, at: Range | null, expr: string, focus: boolean): HTMLElement {
  const range = at && root.contains(at.startContainer) && root.contains(at.endContainer) ? at.cloneRange() : endOf(root)
  /* A caret on the field itself, outside every line of a rich text field, goes into the line. */
  if (range.startContainer === root && root.querySelector("p, h1, h2, h3, h4, li, blockquote")) {
    const r = endOf(root)
    range.setStart(r.startContainer, r.startOffset)
    range.collapse(true)
  }
  range.deleteContents()
  const pill = pillNode(expr)
  range.insertNode(pill)
  ensureCaretRoom(root)
  /* An empty line held a <br> to keep its height; with a pill in it, it would make the line two tall. */
  const after = pill.nextSibling?.nextSibling
  if (after && after.nodeType === 1 && (after as HTMLElement).tagName === "BR" && !after.nextSibling) after.remove()
  if (focus) {
    root.focus({ preventScroll: true })
    caretAfter(pill)
  }
  announceInput(root)
  return pill
}

/**
 * The keys a pill answers, at a collapsed caret beside one. Returns true when
 * it took the key. Shift with an arrow is left to the browser, which already
 * selects a pill as one piece.
 */
export function pillKeyDown(e: { key: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void }, root: HTMLElement): boolean {
  if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return false
  if (e.key === "Backspace" || e.key === "Delete") {
    const pill = pillBeside(root, e.key === "Backspace" ? -1 : 1)
    if (!pill) return false
    e.preventDefault()
    removePill(pill)
    return true
  }
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const dir = e.key === "ArrowRight" ? 1 : -1
    const pill = pillBeside(root, dir)
    if (!pill) return false
    e.preventDefault()
    if (dir === 1) caretAfter(pill)
    else caretBefore(pill)
    return true
  }
  return false
}

/**
 * A copy out of a field with pills carries the placeholders as plain words,
 * so a paste into any of these fields turns them back into pills.
 */
export function copyWithPills(e: ClipboardEvent | { clipboardData: DataTransfer | null; preventDefault: () => void }, root: HTMLElement, cut = false): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !e.clipboardData) return false
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return false
  const box = document.createElement("div")
  box.append(range.cloneContents())
  if (!box.querySelector("[data-value]")) return false
  box.querySelectorAll<HTMLElement>("[data-value]").forEach((p) => p.replaceWith(`{{ ${p.dataset.value} }}`))
  const text = stripZw(box.innerText ?? box.textContent ?? "")
  e.preventDefault()
  e.clipboardData.setData("text/plain", text || stripZw(box.textContent ?? ""))
  if (cut) {
    range.deleteContents()
    ensureCaretRoom(root)
    announceInput(root, "deleteByCut")
  }
  return true
}

/** The pill being changed from its list shows it is the one. */
export function markPill(pill: HTMLElement | null, on: boolean) {
  if (!pill) return
  pill.style.boxShadow = on ? "0 0 0 1.5px #8b5cf6" : ""
  if (on) pill.setAttribute("data-pill-active", "")
  else pill.removeAttribute("data-pill-active")
}
