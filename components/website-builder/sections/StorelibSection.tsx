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
import { useMemo, type FormEvent, type MouseEvent } from "react"
import { SectionWrapper, type SectionProps } from "./_shared"
import { useStorelibContext } from "./storelib-sources"
import { useStorefront } from "../theme/storefront-context"
import { formIntent } from "@/lib/website-builder/form-intent"
import { subscribeToCreator } from "@/lib/website-builder/subscribe-client"

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
  const out = useMemo(() => {
    const ready = prerendered[section.id]
    if (ready) return { ok: true as const, html: ready.html, css: ready.css }
    if (render) return render(section, theme)
    return {
      ok: false as const,
      errors: [{
        file: `sections/${section.type}.storelib`,
        message: `There is no sections/${section.type}.storelib in this theme. Write one in the code editor, or change this section's type.`,
      }],
    }
  }, [prerendered, render, section, theme])

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
  const intercept = onEditorNavigate
    ? (e: MouseEvent<HTMLDivElement>) => {
        const a = (e.target as HTMLElement).closest("a")
        if (!a) return
        e.preventDefault()
        onEditorNavigate(a.getAttribute("href") ?? "#")
      }
    : undefined

  /**
   * ===========================================================================
   *  AN EMAIL BOX IN A SECTION COLLECTS EMAILS FOR THIS SITE'S CREATOR
   * ===========================================================================
   * A section's `<script>` does not run yet, so a form it draws cannot submit
   * itself. This does, following the rule in lib/website-builder/form-intent.ts:
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

    if (inCanvas) {
      e.preventDefault()
      if (intent === "subscribe") settle(form, "done", "Sign-ups go to Subscribers on your live site.")
      return
    }
    if (intent === "native") return
    e.preventDefault()
    if (intent === "inert") return

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
      placement: /newsletter/.test(section.type) ? "newsletter" : "section",
    })
    if (result.ok === false) settle(form, "error", result.error)
    else settle(form, "done", "Thanks, you're on the list.")
  }

  return (
    <SectionWrapper
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className="relative overflow-hidden"
      canvasRoundedTopPx={canvasRoundedTopPx}
      canvasRoundedBottomPx={canvasRoundedBottomPx}
    >
      {out.css ? <style dangerouslySetInnerHTML={{ __html: out.css }} /> : null}
      <div onClickCapture={intercept} onSubmitCapture={onSubmit} dangerouslySetInnerHTML={{ __html: out.html }} />
    </SectionWrapper>
  )
}

export default StorelibSection
