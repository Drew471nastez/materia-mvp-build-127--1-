"use client"

/**
 * ===========================================================================
 *  A SECTION RENDERED FROM ITS .storelib FILE
 * ===========================================================================
 * One React component for every section type that has moved to the theme
 * engine. It does what the fifty hand-written renderers each did on their
 * own — the editor's selection ring, the click to select, the intercepted
 * links — and nothing about how any particular section looks, because that
 * is in the section's own file now.
 *
 * The markup and the scoped CSS come from `renderStorelibSection`, which is
 * pure, so the server and the browser produce the same string and React
 * hydrates it without a mismatch.
 *
 * WHEN THE FILE DOES NOT COMPILE (rule 34): the editor shows a card naming
 * the file and the line, so the person who is editing it can fix it; the
 * published page renders nothing, so a broken section is a gap and not a
 * broken storefront.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react"
import { SectionWrapper, type SectionProps } from "./_shared"
import { useStorelibContext, useStorelibPage } from "./storelib-sources"
import { useStorefront } from "../theme/storefront-context"
import { formIntent } from "@/lib/website-builder/form-intent"
import { signupMode, subscribeToCreator } from "@/lib/website-builder/subscribe-client"
import { pageKeyOfTemplate, sendContactMessage } from "@/lib/website-builder/contact-client"
import { useSiteWishlist } from "../site-wishlist"
import { WISHLIST_SAMPLE_COUNT } from "@/lib/site-accounts/wishlist-list"
import { useSectionScript } from "./section-sandbox"
import { useOverlayHooks } from "./overlay-hooks"
import { enhanceReviewWidgets } from "@/lib/reviews/widgets/enhance"
import { morphInto } from "@/lib/website-builder/morph-html"
import { StorefrontHooks, asksForDrawers } from "./site-chrome-hooks"
import { drawLive } from "@/lib/website-builder/storelib-live-fill"
import { isLive } from "@/lib/website-builder/live-settings"

/** The markup each section element holds, once it has been changed after React drew it. */
const drawn = new WeakMap<Element, string>()

/**
 * A form's state, written onto the form so a section's own CSS can style it:
 * `form[data-state="sending"]`, `[data-state="done"]`, `[data-state="error"]`.
 *
 * The message is plain text in a node this creates. Nothing a server or a
 * visitor sent is ever written as markup.
 */
function settle(form: HTMLFormElement, state: "sending" | "done" | "error", message?: string) {
  form.dataset.state = state
  form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input[type="submit"]').forEach((b) => {
    b.disabled = state === "sending"
  })
  form.querySelector("[data-storelib-message]")?.remove()
  if (state === "sending") return

  /* The section's own success line, if its author wrote one. */
  const own = state === "done" ? form.querySelector<HTMLElement>("[data-storelib-success]") : null
  if (own) {
    Array.from(form.children).forEach((el) => { if (el !== own) (el as HTMLElement).hidden = true })
    own.hidden = false
    return
  }
  if (!message) return

  if (state === "done") {
    Array.from(form.children).forEach((el) => { (el as HTMLElement).hidden = true })
  }
  const note = document.createElement("p")
  note.setAttribute("data-storelib-message", "")
  note.setAttribute("role", state === "error" ? "alert" : "status")
  note.textContent = message
  note.style.cssText = "margin:12px 0 0;font-size:14px;line-height:1.5;"
  form.append(note)
}

export function StorelibSection({
  section,
  theme,
  isEditing,
  isSelected,
  onClick,
  onEditorNavigate,
  insideEditor,
  canvasRoundedTopPx,
  canvasRoundedBottomPx,
}: SectionProps) {
  /**
   * Rendered on the server for a published page, or by the editor's live
   * provider a moment ago. This component holds no engine: see
   * storelib-sources.tsx for why that matters to a visitor's browser.
   */
  const { prerendered, render } = useStorelibContext()
  const { creatorId, inEditor } = useStorefront()
  /**
   * The element the section's own markup is drawn into, so its script can be
   * given a sandbox of the same shape. State rather than a ref, because the
   * hook below has to run again once the node exists.
   */
  const [scriptRoot, setScriptRoot] = useState<HTMLDivElement | null>(null)
  const { template: pageTemplate } = useStorelibPage()
  const wishlist = useSiteWishlist()
  /* When this section appeared, for how long a form in it was on the screen. */
  const shownAt = useRef(0)
  useEffect(() => { shownAt.current = Date.now() }, [])
  const out = useMemo(() => {
    const ready = prerendered[section.id]
    if (ready) {
      return {
        ok: true as const,
        html: ready.html,
        css: ready.css,
        script: ready.script ?? null,
        capabilities: ready.capabilities ?? [],
      }
    }
    /* A value under a finger: from the section's template once it is learned (lib/website-builder/storelib-live-fill.ts). */
    if (render) return drawLive(section, theme, render, isLive())
    return {
      ok: false as const,
      errors: [{
        file: `sections/${section.type}.storelib`,
        message: `There is no sections/${section.type}.storelib in this theme. Write one in the code editor, or change this section's type.`,
      }],
    }
  }, [prerendered, render, section, theme])

  /**
   * ITS SCRIPT RUNS, AND NOT HERE.
   *
   * A section's `<script>` is compiled and checked when it is saved, and
   * then run inside one `<iframe sandbox="allow-scripts">` for the page,
   * against a copy of this section's markup. Nothing in it can reach this
   * document, the visitor's session or their cart; what comes back is a
   * short list of allowed changes. See ./section-sandbox.tsx.
   */
  /**
   * THE MARKUP AS PROPS THAT STAY PUT. React 19 compares these objects, not
   * the strings in them, so building them inline rewrote this section's DOM
   * and re-parsed its stylesheet on every render, changed or not. See
   * ./stable-html.
   */
  /* Keyed on the STRINGS, not on `out`. Any new section or theme object
     makes a new `out` with the same markup in it, and keyed on `out` that
     rewrote the section's DOM anyway: its pictures decoded again, its video
     restarted and its entrance animation played, which was the section
     flashing on a click in the sidebar that changed nothing it draws. */
  const html = out.ok === true ? out.html : ""
  const css = out.ok === true ? out.css : ""
  const cssProp = useMemo(() => (css ? { __html: css } : null), [css])
  /*
    AND A REAL EDIT CHANGES ONLY WHAT IT CHANGED. React is given the markup
    this section first drew, once, and never a new object after it, so React
    never writes `innerHTML` again. A new string is applied below as a change
    (lib/website-builder/morph-html): typing into the heading changes the
    heading's text, and the picture beside it stays the same decoded <img>.
    The server's markup and the first paint are still React's, unchanged.
  */
  const [htmlProp] = useState(() => ({ __html: html }))
  /*
    THE MARKUP THAT IS ON THE PAGE, which is not always `html`. Everything
    below that writes onto the section's elements (the wishlist hearts, the
    cart count, a coded header's own cart panel, its open drawers) has to
    write onto the markup after it changed, not before. Keyed on `html`, it
    did not: React runs a child's layout effects before its parent's, so
    StorefrontHooks wrote the cart count and the cart's lines into the old
    markup, this then applied the new markup over them, and a setting moved
    in the sidebar emptied the header's cart and showed its empty and filled
    states together. Set here, once the new markup is in, so they run again
    against what is actually there.
  */
  const [onPage, setOnPage] = useState(html)
  useLayoutEffect(() => {
    if (!scriptRoot) return
    /* What this element holds: the first markup when React has just drawn it. */
    const holds = drawn.get(scriptRoot) ?? htmlProp.__html
    if (holds !== html) {
      morphInto(scriptRoot, html)
      drawn.set(scriptRoot, html)
    }
    setOnPage(html)
  }, [scriptRoot, html, htmlProp])
  /*
    THE HEARTS SAY WHAT IS SAVED. A section draws each product's heart as
    `data-storelib-wishlist="<product id>"` and cannot know the visitor's list
    (it is rendered once for everybody). The page does: `aria-pressed` on each
    heart, and on the Wishlist page a card whose product was taken out is
    hidden, with the section's own empty line shown once none are left.
    Attributes only, after the markup is in place, so nothing reflows.
  */
  const { ids: savedIds, ready: savedReady, live: savedLive, touched: savedTouched } = wishlist
  /*
    IN THE CANVAS, BEFORE ANY HEART IS PRESSED, the Wishlist page shows its
    first few cards as samples (it is drawn with every product, storelib-live
    editorGlobals), so it can be styled; after, exactly what was saved.
  */
  const sampleMode = !savedLive && !savedTouched
  useLayoutEffect(() => {
    if (!scriptRoot) return
    const saved = new Set(savedIds)
    const cards = Array.from(scriptRoot.querySelectorAll<HTMLElement>("[data-storelib-wishlist-card]"))
    const sample = new Set(sampleMode ? cards.slice(0, WISHLIST_SAMPLE_COUNT).map((el) => (el.getAttribute("data-storelib-wishlist-card") || "").toLowerCase()) : [])
    scriptRoot.querySelectorAll<HTMLElement>("[data-storelib-wishlist]").forEach((el) => {
      const id = (el.getAttribute("data-storelib-wishlist") || "").toLowerCase()
      const on = saved.has(id) || (sample.has(id) && !!el.closest("[data-storelib-wishlist-card]"))
      if (el.getAttribute("aria-pressed") !== String(on)) el.setAttribute("aria-pressed", String(on))
    })
    if (!savedReady) return
    if (cards.length === 0) return
    let shown = 0
    cards.forEach((el) => {
      const id = (el.getAttribute("data-storelib-wishlist-card") || "").toLowerCase()
      const on = sampleMode ? sample.has(id) : saved.has(id)
      el.hidden = !on
      if (on) shown++
    })
    scriptRoot.querySelectorAll<HTMLElement>("[data-storelib-wishlist-empty]").forEach((el) => { el.hidden = shown > 0 })
  }, [scriptRoot, onPage, savedIds, savedReady, sampleMode])

  /*
    THE SITE'S DRAWERS, ASKED FOR BY ATTRIBUTE. A header written as a
    .storelib file marks its bag `data-storelib-cart`, its count
    `data-storelib-cart-count`, its search `data-storelib-search` and its menu
    button `data-storelib-menu`, and the page opens the same cart, search
    window and menu drawer the built-in header does (./site-chrome-hooks.tsx).
  */
  const asksDrawers = useMemo(() => asksForDrawers(html), [html])
  const drawerTrigger = useRef<((e: MouseEvent<HTMLElement>) => boolean) | null>(null)

  const script = out.ok === true ? out.script ?? null : null
  useSectionScript(
    script
      ? {
          id: section.id,
          html: out.ok === true ? out.html : "",
          bundle: script,
          settings: section.settings ?? {},
          blocks: (section.blocks ?? []) as unknown[],
          theme: theme as unknown as Record<string, unknown>,
          page: { template: pageTemplate },
          capabilities: out.ok === true ? out.capabilities ?? [] : [],
        }
      : null,
    scriptRoot,
  )

  /* Back to top and a popup: the page's scroll and the visitor's memory, which a section's script cannot reach (overlay-hooks.ts). */
  useOverlayHooks(scriptRoot, { sectionId: section.id, inCanvas: !!(isEditing || insideEditor || inEditor), html: onPage })
  /* Storelib Reviews widgets: a carousel's Previous and Next and its own movement, and the write form sent without leaving the page, which its markup reads without (lib/reviews/widgets/enhance.ts). */
  useEffect(() => {
    if (!scriptRoot || !(onPage.includes("data-slw-carousel") || onPage.includes("/api/reviews/site") || onPage.includes('id="review-posted"'))) return
    return enhanceReviewWidgets(scriptRoot)
  }, [scriptRoot, onPage])

  if (out.ok === false) {
    if (!isEditing && !insideEditor) return null
    return (
      <SectionWrapper isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
        <div className="px-6 py-5 text-[13px] leading-5 text-[#991b1b] bg-[#fef2f2] border-y border-[#fecaca]">
          <p className="font-semibold">{section.name || section.type} could not be drawn</p>
          <ul className="mt-1 font-mono text-[12px]">
            {out.errors.map((e, i) => (
              <li key={i}>
                {e.file ?? ""}
                {e.line ? `:${e.line}` : ""} {e.message}
              </li>
            ))}
          </ul>
        </div>
      </SectionWrapper>
    )
  }

  /**
   * In the editor a link inside a section navigates the CANVAS, not the
   * browser. The React renderers each wired this by hand; here it is one
   * capture-phase handler over the rendered markup.
   */
  const intercept = (e: MouseEvent<HTMLDivElement>) => {
    if (drawerTrigger.current?.(e)) return
    /*
      A HEART IS A BUTTON, NOT A LINK. It sits over the card's link, so the
      click stops here and the card does not open: the product is saved, or
      taken out, and the visitor stays where they are. In the canvas it
      toggles in memory, so a creator can see both states.
    */
    const heart = (e.target as HTMLElement).closest<HTMLElement>("[data-storelib-wishlist]")
    if (heart && e.currentTarget.contains(heart)) {
      e.preventDefault()
      e.stopPropagation()
      const id = heart.getAttribute("data-storelib-wishlist") || ""
      /* A sample on the canvas's Wishlist page is removed by its heart: the samples become the list first. */
      if (id && sampleMode && heart.closest("[data-storelib-wishlist-card]")) {
        const shown = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-storelib-wishlist-card]:not([hidden])")).map((el) => el.getAttribute("data-storelib-wishlist-card") || "")
        wishlist.seedSample(shown)
        wishlist.toggle(id, false)
        return
      }
      if (id) wishlist.toggle(id)
      return
    }
    if (!onEditorNavigate) return
    const a = (e.target as HTMLElement).closest("a")
    if (!a) return
    e.preventDefault()
    /*
      THE SITE'S NAVIGATION IS NAVIGATION, WITH THE INSPECTOR ON TOO. The
      React header told the editor so; this one did not, so in the default
      theme (whose header is a .storelib file) the logo and every menu link
      were taken for a tap meant to select the header, and nothing moved in
      the editor where the live site went to the page. A link in the header
      or footer group, or in a <nav>, is followed, as the live site does
      (lib/website-builder/editor-navigation.ts).
    */
    /* The section's group as the theme reads it (groupOf), written out here: nothing of the engine is imported in this file (tests/theme-code-editor). */
    const chrome = section.group === "header" || section.group === "footer" || (!section.group && (section.type === "header" || section.type === "footer"))
    const fromNav = chrome || !!a.closest("nav, [role='navigation']")
    onEditorNavigate(a.getAttribute("href") ?? "#", fromNav)
  }

  /**
   * ===========================================================================
   *  AN EMAIL BOX IN A SECTION COLLECTS EMAILS FOR THIS SITE'S CREATOR
   * ===========================================================================
   * A form a section draws is submitted by the page, not by the section's
   * script, which runs in a sandbox with no network of its own. This does
   * it, following the rule in lib/website-builder/form-intent.ts:
   * an email box with no address of its own goes to the creator's
   * Subscribers, with no script and nothing for the section's author to wire.
   *
   * The builder's canvas never submits anything and never leaves the editor.
   * It shows the success state with a line saying where sign-ups will go,
   * because designing a page is not signing up to it.
   */
  const inCanvas = isEditing || insideEditor || inEditor
  const onSubmit = async (e: FormEvent<HTMLDivElement>) => {
    const form = e.target
    if (!(form instanceof HTMLFormElement)) return
    const intent = formIntent(form)

    if (signupMode({ inEditor: inCanvas, creatorId }) === "preview") {
      e.preventDefault()
      if (intent === "subscribe") settle(form, "done", "Sign-ups go to Subscribers on your live site.")
      if (intent === "contact") settle(form, "done", "Messages reach your email on your live site.")
      return
    }
    if (intent === "native") return
    e.preventDefault()
    if (intent === "inert") return

    /*
      A MESSAGE TO THE CREATOR. The fields are read by name: name, email,
      subject, message, and the unticked consent box. `company` is a field no
      person can see, so a value in it is a script. See
      lib/website-builder/contact-client.ts and the route behind it.
    */
    if (intent === "contact") {
      const field = (n: string) =>
        (form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${n}"]`)?.value ?? "").trim()
      if (!creatorId) {
        settle(form, "error", "Messages cannot be sent from this page.")
        return
      }
      settle(form, "sending")
      const result = await sendContactMessage({
        creatorId,
        name: field("name"),
        email: field("email") || (form.querySelector<HTMLInputElement>('input[type="email"]')?.value ?? ""),
        subject: field("subject"),
        message: field("message"),
        consent: form.querySelector<HTMLInputElement>('input[name="consent"]')?.checked === true,
        company: field("company"),
        elapsed: shownAt.current ? Date.now() - shownAt.current : 0,
        page: pageKeyOfTemplate(pageTemplate),
        sectionId: section.id,
      })
      if (result.ok === false) settle(form, "error", result.error)
      else settle(form, "done", "Thanks. Your message has been sent.")
      return
    }

    const email = form.querySelector<HTMLInputElement>('input[type="email"]')?.value ?? ""
    const name =
      form.querySelector<HTMLInputElement>('input[name="name"], input[autocomplete="name"]')?.value ?? ""
    if (!creatorId) {
      settle(form, "error", "Sign-ups are not available on this page.")
      return
    }
    settle(form, "sending")
    const result = await subscribeToCreator({
      creatorId,
      email,
      name,
      /* The password page's box is a "tell me when you open", and its consent line says so. */
      placement: section.type === "main_password" ? "password" : /newsletter/.test(section.type) ? "newsletter" : "section",
      company: form.querySelector<HTMLInputElement>('input[name="company"]')?.value ?? "",
    })
    if (result.ok === false) settle(form, "error", result.error)
    else settle(form, "done", "Thanks, you're on the list.")
  }

  /**
   * A SHOP'S FILTERS APPLY AS THEY ARE TICKED. The filter form a section
   * draws (`data-storelib-filters`, lib/products/catalog-filters.ts) is a
   * plain GET form with an Apply button, which is what works before any
   * script. On the live page a ticked box or a new sort submits it at once,
   * the way Shopify's filters do. The section's own script cannot: it runs in
   * a sandbox that may not navigate. The canvas never leaves the editor.
   */
  const onFilterChange = (e: FormEvent<HTMLDivElement>) => {
    if (inCanvas) return
    const field = e.target as HTMLElement
    const form = field.closest?.("form[data-storelib-filters]") as HTMLFormElement | null
    if (!form || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return
    if (field instanceof HTMLInputElement && field.type !== "checkbox") return
    if (field.classList.contains("cat__toggle")) return
    form.requestSubmit()
  }

  return (
    <SectionWrapper
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      /* Clipped sideways only: a hero at 100vw must not widen the page, and
         a header's dropdown must still hang below the header. */
      className="relative overflow-x-clip"
      canvasRoundedTopPx={canvasRoundedTopPx}
      canvasRoundedBottomPx={canvasRoundedBottomPx}
    >
      {cssProp ? <style dangerouslySetInnerHTML={cssProp} /> : null}
      <div
        ref={setScriptRoot}
        onClickCapture={intercept}
        onSubmitCapture={onSubmit}
        onChangeCapture={onFilterChange}
        dangerouslySetInnerHTML={htmlProp}
      />
      {asksDrawers && (
        <StorefrontHooks
          trigger={drawerTrigger}
          section={section}
          theme={theme}
          html={onPage}
          scriptRoot={scriptRoot}
          inCanvas={!!(isEditing || insideEditor || inEditor)}
          onEditorNavigate={onEditorNavigate}
        />
      )}
    </SectionWrapper>
  )
}

export default StorelibSection
