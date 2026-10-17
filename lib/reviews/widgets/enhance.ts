/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS: THE LITTLE SCRIPT THEY CAN DO WITHOUT
 * ===========================================================================
 * Everything a widget shows works without this (./render.ts): a carousel is
 * a row that scrolls and snaps, by swipe, trackpad, scrollbar or the arrow
 * keys once it has focus. This adds its Previous and Next buttons (hidden
 * until it runs, `data-slw-ready`) and, when the widget is set to, moves it
 * on by itself: never for somebody who asked for less motion, and never
 * while a pointer is over it, it has focus, or the tab is in the background.
 *
 * It also sends a review's write form without leaving the page, and brings
 * a buyer back from the confirm email to the section (round AH, below).
 *
 * SELF CONTAINED ON PURPOSE. No imports and no closures over the module, so
 * an imported theme can carry it as an inline script
 * (`reviewWidgetScript()`), and the Storelib theme's section and the gallery
 * call the same function. Idempotent: a carousel already set up is skipped.
 * Returns what undoes it.
 */
export function enhanceReviewWidgets(root: ParentNode): () => void {
  const undo: (() => void)[] = []
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  root.querySelectorAll<HTMLElement>("[data-slw-carousel]").forEach((car) => {
    if (car.hasAttribute("data-slw-ready")) return
    const track = car.querySelector<HTMLElement>(".slw-track")
    const prev = car.querySelector<HTMLButtonElement>("[data-slw-prev]")
    const next = car.querySelector<HTMLButtonElement>("[data-slw-next]")
    if (!track || !prev || !next) return
    car.setAttribute("data-slw-ready", "")
    const step = () => {
      const first = track.firstElementChild as HTMLElement | null
      const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 0
      return first ? first.getBoundingClientRect().width + gap : track.clientWidth
    }
    const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4
    const sync = () => {
      prev.disabled = track.scrollLeft <= 4
      next.disabled = atEnd()
    }
    const go = (dir: number) => track.scrollBy({ left: dir * step(), behavior: calm ? "auto" : "smooth" })
    const onPrev = () => go(-1)
    const onNext = () => go(1)
    prev.addEventListener("click", onPrev)
    next.addEventListener("click", onNext)
    track.addEventListener("scroll", sync, { passive: true })
    sync()
    let timer: ReturnType<typeof setInterval> | null = null
    let held = false
    const seconds = Number(car.getAttribute("data-autoplay")) || 0
    const tick = () => {
      if (held || (typeof document !== "undefined" && document.hidden)) return
      if (atEnd()) track.scrollTo({ left: 0, behavior: calm ? "auto" : "smooth" })
      else go(1)
    }
    const hold = () => { held = true }
    const free = () => { held = false }
    if (seconds > 0 && !calm) {
      timer = setInterval(tick, Math.max(3, Math.min(15, seconds)) * 1000)
      car.addEventListener("pointerenter", hold)
      car.addEventListener("pointerleave", free)
      car.addEventListener("focusin", hold)
      car.addEventListener("focusout", free)
      car.addEventListener("touchstart", hold, { passive: true })
    }
    undo.push(() => {
      prev.removeEventListener("click", onPrev)
      next.removeEventListener("click", onNext)
      track.removeEventListener("scroll", sync)
      car.removeEventListener("pointerenter", hold)
      car.removeEventListener("pointerleave", free)
      car.removeEventListener("focusin", hold)
      car.removeEventListener("focusout", free)
      car.removeEventListener("touchstart", hold)
      if (timer) clearInterval(timer)
      car.removeAttribute("data-slw-ready")
    })
  })
  /*
    THE WRITE FORM, WITHOUT LEAVING THE PAGE (round AH). The form posts with
    no script and comes back to the page at #review-check-email: the whole
    seller's page reloaded and jumped. Here it is sent in the background
    instead (Accept: application/json, app/api/reviews/site): the button
    turns while it goes, photos show as thumbnails when picked and a thin bar
    fills as they upload, and the answer replaces the form in place with the
    section's own words. A plain form still works where this never runs.
    The page's address goes with it, so the email's confirm link comes back
    to this page and this section.
  */
  const fade = (el: HTMLElement) => {
    if (calm || typeof el.animate !== "function") return
    el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" })
  }
  const REVIEW_ACTION = /\/api\/reviews\/site(?:$|[?#])/
  root.querySelectorAll<HTMLFormElement>('form[data-storelib-form="native"]').forEach((form) => {
    if (form.hasAttribute("data-slr-ready") || !REVIEW_ACTION.test(form.getAttribute("action") || "")) return
    form.setAttribute("data-slr-ready", "")
    const scope = (form.closest(".slw, .slrv, .rv, [data-section-id], section") as HTMLElement | null) || (form.parentElement as HTMLElement)
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"][name="photos"]')
    const noteText = (id: string) => ((scope && scope.querySelector("#" + id)) || document.getElementById(id))?.textContent?.trim() || ""
    /* What is said under the button: an error, in the form's own type. */
    const status = document.createElement("p")
    status.setAttribute("role", "status")
    status.setAttribute("aria-live", "polite")
    status.setAttribute("data-slr-status", "")
    status.style.cssText = "margin:0;font-size:14px;line-height:1.45;min-height:0"
    if (button) button.insertAdjacentElement("afterend", status)
    else form.appendChild(status)
    /* The bar the photos fill as they upload. */
    const bar = document.createElement("div")
    bar.setAttribute("aria-hidden", "true")
    bar.style.cssText = "display:none;height:3px;border-radius:3px;background:rgba(127,127,127,.2);overflow:hidden"
    const fill = document.createElement("div")
    fill.style.cssText = "height:100%;width:0;background:currentColor;transition:width .2s ease"
    bar.appendChild(fill)
    status.insertAdjacentElement("beforebegin", bar)
    /* The photos picked, as small squares, the moment they are. */
    let thumbs: HTMLDivElement | null = null
    let urls: string[] = []
    const showThumbs = () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls = []
      if (!fileInput) return
      if (!thumbs) {
        thumbs = document.createElement("div")
        thumbs.setAttribute("data-slr-thumbs", "")
        thumbs.style.cssText = "display:flex;flex-wrap:wrap;gap:8px"
        fileInput.insertAdjacentElement("afterend", thumbs)
      }
      thumbs.textContent = ""
      Array.from(fileInput.files || []).slice(0, 4).forEach((f) => {
        if (!/^image\//.test(f.type)) return
        const u = URL.createObjectURL(f)
        urls.push(u)
        const img = document.createElement("img")
        img.src = u
        img.alt = ""
        img.style.cssText = "width:56px;height:56px;object-fit:cover;border-radius:8px;box-shadow:0 0 0 1px rgba(127,127,127,.25)"
        thumbs!.appendChild(img)
        fade(img)
      })
    }
    if (fileInput) fileInput.addEventListener("change", showThumbs)
    /* The button, turning while the review goes. */
    let spin: Animation | null = null
    const busy = (on: boolean) => {
      form.dataset.state = on ? "sending" : ""
      form.setAttribute("aria-busy", on ? "true" : "false")
      if (!button) return
      button.disabled = on
      button.style.opacity = on ? "0.75" : ""
      const old = button.querySelector("[data-slr-spin]")
      if (old) old.remove()
      if (spin) { spin.cancel(); spin = null }
      if (!on) return
      const s = document.createElement("span")
      s.setAttribute("data-slr-spin", "")
      s.setAttribute("aria-hidden", "true")
      s.style.cssText = "display:inline-block;width:14px;height:14px;margin-inline-start:8px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;vertical-align:-2px"
      button.appendChild(s)
      if (typeof s.animate === "function") spin = s.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 700, iterations: Infinity })
    }
    const fail = (message: string) => {
      busy(false)
      bar.style.display = "none"
      form.dataset.state = "error"
      status.textContent = message || noteText("review-error")
      fade(status)
    }
    /* The answer, in place of the form: the section's own words, with a tick. */
    const done = (posted: string) => {
      busy(false)
      const panel = document.createElement("div")
      panel.setAttribute("data-slr-done", "")
      panel.setAttribute("tabindex", "-1")
      panel.style.cssText = "display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border-radius:12px;box-shadow:0 0 0 1px rgba(127,127,127,.22),0 1px 2px rgba(0,0,0,.04);font-size:15px;line-height:1.5"
      const tick = document.createElement("span")
      tick.setAttribute("aria-hidden", "true")
      tick.textContent = "\u2713"
      tick.style.cssText = "flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(127,127,127,.18);font-size:13px;font-weight:700"
      const text = document.createElement("p")
      text.style.margin = "0"
      text.textContent = noteText(posted) || noteText("review-check-email")
      panel.appendChild(tick)
      panel.appendChild(text)
      const host = (form.closest("details") as HTMLElement | null) || form
      host.insertAdjacentElement("afterend", panel)
      host.style.display = "none"
      fade(panel)
      try { panel.focus({ preventScroll: true }) } catch { /* old browsers */ }
      const r = panel.getBoundingClientRect()
      if (r.top < 0 || r.bottom > innerHeight) panel.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" })
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    const onSubmit = (e: Event) => {
      if (typeof XMLHttpRequest === "undefined" || typeof FormData === "undefined") return
      e.preventDefault()
      if (form.dataset.state === "sending") return
      if (typeof form.reportValidity === "function" && !form.reportValidity()) return
      const data = new FormData(form)
      data.set("page", location.href.split("#")[0])
      const photos = fileInput && fileInput.files ? fileInput.files.length : 0
      status.textContent = ""
      busy(true)
      if (photos) { bar.style.display = "block"; fill.style.width = "4%" }
      const xhr = new XMLHttpRequest()
      xhr.open("POST", form.action)
      xhr.setRequestHeader("Accept", "application/json")
      xhr.upload.onprogress = (ev) => {
        if (photos && ev.lengthComputable) fill.style.width = Math.max(4, Math.round((ev.loaded / ev.total) * 100)) + "%"
      }
      xhr.onload = () => {
        let body: { status?: string; error?: string } = {}
        try { body = JSON.parse(xhr.responseText || "{}") } catch { body = {} }
        if (photos) fill.style.width = "100%"
        if (xhr.status >= 200 && xhr.status < 300) done(body.status === "posted" ? "review-posted" : body.status === "waiting" ? "review-waiting" : "review-check-email")
        else fail(typeof body.error === "string" && body.error.length < 200 && body.error !== "limit" && body.error !== "Bad request" ? body.error : "")
      }
      xhr.onerror = () => fail("")
      xhr.send(data)
    }
    form.addEventListener("submit", onSubmit)
    undo.push(() => {
      form.removeEventListener("submit", onSubmit)
      if (fileInput) fileInput.removeEventListener("change", showThumbs)
      urls.forEach((u) => URL.revokeObjectURL(u))
      form.removeAttribute("data-slr-ready")
    })
  })
  /*
    BACK FROM THE EMAIL. The confirm page sends the buyer back to the page they
    wrote on with ?slr=posted (or waiting): no #fragment, so the browser does
    not jump. The section's own line is shown and the page glides to it, and
    the address is put back as it was.
  */
  try {
    const params = new URLSearchParams(location.search)
    const back = params.get("slr")
    if (back === "posted" || back === "waiting") {
      const note = root.querySelector<HTMLElement>("#review-" + back)
      if (note && !note.hasAttribute("data-slr-shown")) {
        note.setAttribute("data-slr-shown", "")
        note.style.display = "block"
        params.delete("slr")
        const q = params.toString()
        history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash)
        const go = () => {
          const host = (note.closest(".slw, .slrv, .rv, section") as HTMLElement | null) || note
          host.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" })
          fade(note)
        }
        if (document.readyState === "complete") setTimeout(go, 120)
        else addEventListener("load", () => setTimeout(go, 120), { once: true })
      }
    }
  } catch {
    /* No URL to read: nothing to show. */
  }
  return () => undo.forEach((f) => f())
}

/**
 * The same, as a script an imported theme's page runs once where the widget
 * is: it sets up the widget it sits in.
 */
export function reviewWidgetScript(): string {
  /* `__name`: a bundler that keeps function names (esbuild's keepNames) wraps them in a helper the inline copy would not have. */
  return `<script>(function(){var __name=function(f){return f};var s=document.currentScript;var r=s&&s.parentElement;if(!r)return;try{(${enhanceReviewWidgets.toString()})(r)}catch(e){}})()</script>`
}
