"use client"

import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE PRODUCTS LIST CHANGING VIEW, WITHOUT A JUMP
 * ===========================================================================
 * All, Active, Draft and Archived used to swap the rows in one frame. Now a
 * change of view is a short settle, measured before the change and played
 * right after it, before that frame is painted (the classic first, last,
 * invert, play):
 *
 *   A ROW IN BOTH VIEWS keeps its element (products-client keys rows by id
 *   and never unmounts one it has shown) and glides from where it was to
 *   where it is now, on transform, ROW_MOVE_MS.
 *
 *   A ROW THAT LEAVES is hidden at once, and a copy of it, drawn where it
 *   was, fades out over ROW_FADE_OUT_MS above the list. So whatever the
 *   views hold, some row is always drawn: the list is never empty for a
 *   frame, the old rows fade while the new ones come in.
 *
 *   A ROW THAT ARRIVES fades in from 6px below, ROW_FADE_IN_MS, one after
 *   another 16ms apart for the first six.
 *
 *   THE HEIGHT. A shorter list keeps the old height until the rows have
 *   settled, so nothing under it moves early. On a computer the card's foot
 *   glides to its new place (clip-path on the card, no layout), with the
 *   footer riding along on transform; on a phone there is no card to draw.
 *   If the page was scrolled further than the shorter list reaches, it
 *   scrolls up smoothly before the old height is let go, instead of the
 *   browser snapping it there.
 *
 * Opacity and transform on the rows, clip-path on the card, nothing that
 * lays the page out per frame. Nothing at all under reduced motion.
 */

export const ROW_MOVE_MS = 220
export const ROW_FADE_IN_MS = 200
export const ROW_FADE_OUT_MS = 140
const ROW_STAGGER_MS = 16
const ROW_STAGGER_MAX = 6
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

type Row = { top: number; left: number; width: number; height: number }
export type ListShot = {
  rows: Map<string, Row>
  height: number
  footer: number | null
  /* The table's column widths, for a leaving table row's copy. */
  columns: number[]
}

const running = new WeakMap<HTMLElement, () => void>()

function reducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** The list drawn at this width: the phone's <ul> or the table's body. */
function shownList(section: HTMLElement): HTMLElement | null {
  const ul = section.querySelector<HTMLElement>("[data-list]")
  if (ul && ul.getClientRects().length > 0) return ul
  return section.querySelector<HTMLElement>("tbody")
}

function visibleRows(list: HTMLElement) {
  return Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-row]:not([hidden])"))
}

function footerTop(section: HTMLElement, base: DOMRect) {
  const f = section.querySelector<HTMLElement>("[data-footer]")
  if (!f || f.getClientRects().length === 0) return null
  return f.getBoundingClientRect().top - base.top
}

/** Where everything is, just before the view changes. */
export function shootList(section: HTMLElement | null): ListShot | null {
  if (!section || reducedMotion() || typeof section.animate !== "function") return null
  /* A second change while the first is still settling starts from the page as laid out. */
  running.get(section)?.()
  const list = shownList(section)
  if (!list) return null
  const base = section.getBoundingClientRect()
  const rows = new Map<string, Row>()
  for (const el of visibleRows(list)) {
    const r = el.getBoundingClientRect()
    rows.set(el.dataset.row as string, { top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height })
  }
  const columns = Array.from(section.querySelectorAll<HTMLElement>("thead th")).map((th) => th.getBoundingClientRect().width)
  return { rows, height: base.height, footer: footerTop(section, base), columns }
}

/** A leaving row, drawn where it was, above the list. */
function copyOf(el: HTMLElement, at: Row, shot: ListShot, section: HTMLElement): HTMLElement {
  const place = (node: HTMLElement) => {
    node.style.position = "absolute"
    node.style.top = `${at.top}px`
    node.style.left = `${at.left}px`
    node.style.width = `${at.width}px`
    node.style.height = `${at.height}px`
    node.style.margin = "0"
    return node
  }
  const row = el.cloneNode(true) as HTMLElement
  row.removeAttribute("hidden")
  row.removeAttribute("data-row")
  if (row.tagName !== "TR") return place(row)
  /* A table row is laid out by its table: give the copy a table of its own with the same columns. */
  const table = section.querySelector("table")
  const copy = document.createElement("table")
  copy.className = table?.className ?? ""
  copy.style.display = "table"
  const body = document.createElement("tbody")
  body.append(row)
  copy.append(body)
  const cells = Array.from(row.children) as HTMLElement[]
  cells.forEach((td, i) => {
    if (shot.columns[i] !== undefined) td.style.width = `${shot.columns[i]}px`
  })
  return place(copy)
}

/** Play the change, after React has committed it and before it is painted. */
export function playList(section: HTMLElement | null, before: ListShot | null) {
  if (!section || !before) return
  const list = shownList(section)
  if (!list) return
  const base = section.getBoundingClientRect()
  const now = visibleRows(list)
  const seen = new Set<string>()
  const done: Array<() => void> = []
  let arriving = 0

  for (const el of now) {
    const id = el.dataset.row as string
    seen.add(id)
    const was = before.rows.get(id)
    if (was) {
      const dy = was.top - (el.getBoundingClientRect().top - base.top)
      if (Math.abs(dy) < 0.5) continue
      const a = el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: ROW_MOVE_MS, easing: EASE })
      done.push(() => a.cancel())
    } else {
      const a = el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], {
        duration: ROW_FADE_IN_MS,
        delay: Math.min(arriving++, ROW_STAGGER_MAX) * ROW_STAGGER_MS,
        easing: "ease-out",
        fill: "backwards",
      })
      done.push(() => a.cancel())
    }
  }

  /* The rows that left, as copies that fade where they were. */
  const leaving = [...before.rows].filter(([id]) => !seen.has(id))
  if (leaving.length) {
    const layer = document.createElement("div")
    layer.dataset.listLeaving = ""
    layer.setAttribute("aria-hidden", "true")
    layer.inert = true
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:1"
    for (const [id, at] of leaving) {
      const el = list.querySelector<HTMLElement>(`:scope > [data-row="${CSS.escape(id)}"]`)
      if (el) layer.append(copyOf(el, at, before, section))
    }
    section.append(layer)
    const a = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ROW_FADE_OUT_MS, easing: "ease-in", fill: "forwards" })
    const remove = () => layer.remove()
    a.onfinish = remove
    done.push(remove)
  }

  /* An empty view's words come in the same way as a row. */
  const empty = section.querySelector<HTMLElement>("[data-empty]")
  if (empty && before.rows.size > 0) {
    const a = empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ROW_FADE_IN_MS, delay: ROW_FADE_OUT_MS / 2, easing: "ease-out", fill: "backwards" })
    done.push(() => a.cancel())
  }

  /* The height, and the footer that sits at the foot of it. */
  const height = base.height
  const footer = footerTop(section, base)
  if (footer !== null && before.footer !== null && Math.abs(before.footer - footer) >= 0.5) {
    const f = section.querySelector<HTMLElement>("[data-footer]")
    const a = f?.animate([{ transform: `translateY(${before.footer - footer}px)` }, { transform: "translateY(0)" }], { duration: ROW_MOVE_MS, easing: EASE })
    if (a) done.push(() => a.cancel())
  }
  const card = getComputedStyle(section).backgroundColor !== "rgba(0, 0, 0, 0)"
  const radius = getComputedStyle(section).borderBottomLeftRadius
  const shrink = before.height - height
  /* Let go of the held height and the card's clip together, in one frame, once all has settled. */
  const held: Array<() => void> = []
  const release = () => {
    for (const h of held.splice(0)) h()
  }
  if (Math.abs(shrink) >= 0.5) {
    if (shrink > 0) {
      section.style.minHeight = `${before.height}px`
      held.push(() => {
        section.style.minHeight = ""
      })
    }
    if (card) {
      const from = shrink > 0 ? 0 : -shrink
      const to = shrink > 0 ? shrink : 0
      const a = section.animate(
        [{ clipPath: `inset(0 0 ${from}px 0 round ${radius})` }, { clipPath: `inset(0 0 ${to}px 0 round ${radius})` }],
        { duration: ROW_MOVE_MS, easing: EASE, fill: "forwards" },
      )
      held.push(() => a.cancel())
    }
  }

  /* A page scrolled past where the shorter list ends glides up first. */
  const pane = section.closest<HTMLElement>(".orders-pane")
  let settled = Promise.resolve()
  if (shrink > 0 && pane) {
    const reach = pane.scrollHeight - shrink - pane.clientHeight
    if (pane.scrollTop > reach + 0.5) {
      pane.scrollTo({ top: Math.max(0, reach), behavior: "smooth" })
      settled = new Promise((resolve) => {
        const began = performance.now()
        const check = () => {
          if (pane.scrollTop <= reach + 1 || performance.now() - began > 700) resolve()
          else requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      })
    }
  }

  let over = false
  const finish = () => {
    if (over) return
    over = true
    running.delete(section)
    release()
    for (const d of done) d()
  }
  running.set(section, finish)
  const timer = new Promise((resolve) => window.setTimeout(resolve, Math.max(ROW_MOVE_MS, ROW_FADE_IN_MS + ROW_STAGGER_MAX * ROW_STAGGER_MS)))
  void Promise.all([timer, settled]).then(() => {
    if (running.get(section) === finish) {
      /* Everything has ended by itself: only the held height is left to let go. */
      over = true
      running.delete(section)
      release()
      section.querySelectorAll("[data-list-leaving]").forEach((n) => n.remove())
    }
  })
}
