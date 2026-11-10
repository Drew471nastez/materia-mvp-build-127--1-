"use client"
/**
 * What happens on the page when a button with an action is pressed
 * (lib/forms/actions). The button stays an ordinary link to the action's
 * address, so it works without JavaScript and keeps its click count; this
 * frame takes the press first for the actions that open something here:
 *
 *   a form, a quiz or a booking form   the form, in a dialog on the page
 *   a chat with a pre-chat form        the form first; its answers fill the
 *                                      message, then the chat opens
 *   a product                          its details sheet (the full product,
 *                                      read by the sheet), and Buy goes on
 *                                      through the product block's own steps
 *                                      (lib/onepage/purchase-flow): the sheet
 *                                      leaves, then the in-page checkout
 *                                      opens where the product has instant
 *                                      checkout on, else its checkout page
 *
 * Everything it opens is loaded on that press, so a page without such a
 * button loads none of it.
 *
 * ROUND AN: ON A OnePage A FORM OPENS IN THE BLOCK SHEET (components/onepage/
 * block-sheet useBlockSheet), with the same rise as every other block, its
 * questions read from the press on (./public-form prefetchPublicForm) so
 * they are usually there when the sheet settles. A chat's questions, once
 * sent, close the sheet, and the chat opens only after the sheet AND its
 * history entry have gone (onGone), so the sheet's step back never lands on
 * top of the page WhatsApp is opening. Where no sheet is drawn (a website,
 * a creator page) the form opens in the dialog as before (./form-dialog).
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { actionFormId, actionHref, formVars, type ActionVars, type NativeAction } from "@/lib/forms/actions"
import { HANDOFF_MAX_MS, PURCHASE_CLOSED, purchaseStep, sheetShown, type PurchaseLayer, type PurchaseStep } from "@/lib/onepage/purchase-flow"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
/* The contract alone (./block-sheet-context): the sheet itself is the page's, and stays out of a creator page's first script. */
import { useBlockSheet } from "@/components/onepage/block-sheet-context"
import { tt } from "@/lib/i18n/text"

const FormDialog = lazy(() => import("./form-dialog"))
const FormSheetBody = lazy(() => import("./form-sheet-body"))

/*
 * ROUND AP: THE SHEET RISES WITH THE QUESTIONS IN IT. It used to rise with a
 * placeholder three lines tall, and the questions arrived during the rise:
 * the sheet grew under the finger and its top edge jumped (the owner: "it
 * opens and it glitches, and then it opens"). The press now waits for the
 * form's code and its questions (both asked for when the finger came down),
 * never longer than FORM_READY_MS, and the sheet is built with the form
 * itself rather than a Suspense placeholder. On a slow network it opens at
 * the limit with the placeholder, and the sheet eases to the form's height
 * when it comes (components/onepage/block-sheet, late content).
 */
const FORM_READY_MS = 280
type FormSheetBodyComponent = typeof import("./form-sheet-body").default

/*
 * ROUND AR: READY BEFORE THE PRESS. The owner: a sheet "takes so much to load",
 * and the grey bars it rose with read as loading. The form's code and its
 * questions are now read while the page is idle, as soon as its button comes
 * near the screen (and again on hover or a finger coming down), so the press
 * finds both and builds the sheet with the form in it in that same task:
 * no wait and nothing standing in for it. Only a press that beats the read
 * waits, as before, up to FORM_READY_MS.
 */
let sheetBodyModule: FormSheetBodyComponent | null = null
const loadSheetBody = () =>
  import("./form-sheet-body").then((m) => {
    sheetBodyModule = m.default
    return m.default
  })
const readyForms = new Set<string>()
function warmForm(id: string): Promise<unknown> {
  return Promise.all([
    loadSheetBody(),
    import("./public-form").then((m) => m.prefetchPublicForm(id)).then((r) => {
      if (r.form) readyForms.add(id)
      return r
    }),
  ])
}
/** Run when the browser has a moment, or soon after where it never says so. */
function whenIdle(run: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (w.requestIdleCallback) {
    const h = w.requestIdleCallback(run, { timeout: 1500 })
    return () => w.cancelIdleCallback?.(h)
  }
  const t = window.setTimeout(run, 200)
  return () => window.clearTimeout(t)
}

/** The room the form will take while it arrives on a slow line: quiet, and nothing that looks like loading for half a second. */
function FormSheetWaiting() {
  return (
    <div className="flex min-h-[240px] items-center justify-center gap-1.5" role="status" aria-label={tt("Loading form")} data-form-sheet-waiting="">
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--sheet-muted,#9ca3af)] opacity-60 [animation:op-late-in_200ms_ease-out_500ms_both] motion-reduce:[animation:none]" />
      ))}
    </div>
  )
}
const ProductSheet = lazy(() => import("@/components/onepage/product-sheet").then((m) => ({ default: m.ProductSheet })))
const InstantCheckout = lazy(() => import("@/components/checkout/instant-checkout").then((m) => ({ default: m.InstantCheckout })))

type Source = "onepage" | "website" | "creator_page"

export function NativeActionFrame({
  action,
  children,
  source = "onepage",
  preview = false,
  vars,
  sourceBlock,
  dark = false,
  seller,
}: {
  preview?: boolean
  action?: NativeAction | null
  children: ReactNode
  source?: Source
  /** What the message's variables mean on this block (lib/onepage/block-action blockActionVars). */
  vars?: ActionVars
  /** The block or section title, kept with a lead as where it came from. */
  sourceBlock?: string
  /** The page behind is dark: the checkout window follows it. */
  dark?: boolean
  /** Who sells, for the checkout's head when the product has no picture. */
  seller?: { name?: string | null; avatarUrl?: string | null } | null
}) {
  const [formOpen, setFormOpen] = useState(false)
  /* The product's windows: one state, the product block's own steps. */
  const [layer, setLayer] = useState<PurchaseLayer>(PURCHASE_CLOSED)
  const step = useCallback((s: PurchaseStep) => setLayer((was) => purchaseStep(was, s)), [])
  /* The sheet stays mounted once opened, so closing it slides it away instead of cutting it off. */
  const [sheetMounted, setSheetMounted] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const blockSheet = useBlockSheet()
  const warmId = actionFormId(action)
  const warmable = !!warmId && blockSheet.available
  /* Round AR: the form is read once its button is near the screen, when the page is idle (see READY BEFORE THE PRESS). */
  useEffect(() => {
    const el = frame.current
    if (!warmable || !warmId || !el || readyForms.has(warmId)) return
    let cancelIdle: (() => void) | null = null
    const go = () => {
      cancelIdle = whenIdle(() => void warmForm(warmId).catch(() => {}))
    }
    if (typeof IntersectionObserver !== "function") {
      go()
      return () => cancelIdle?.()
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        go()
      },
      { rootMargin: "600px 0px" },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelIdle?.()
    }
  }, [warmable, warmId])
  useEffect(() => {
    if (layer.kind !== "handoff") return
    const t = window.setTimeout(() => step({ type: "too-long" }), HANDOFF_MAX_MS)
    return () => window.clearTimeout(t)
  }, [layer.kind, step])

  const formId = actionFormId(action)
  const chat = action?.type === "whatsapp" || action?.type === "telegram"
  /* "Checkout" stays the link to the checkout page, which knows a product that ships from one that does not. */
  const product = action?.type === "product" && (action as { open?: string }).open !== "checkout" ? (action as Extract<NativeAction, { type: "product" }>) : null
  if (!formId && !product) return <>{children}</>
  const inPreview = preview || isOnePagePreview()
  const checkout = layer.kind === "checkout" ? layer : null

  /* The form in the block sheet; a chat waits for the sheet to be gone before it opens. */
  const openFormSheet = (id: string) => {
    /* Read already (READY BEFORE THE PRESS): the sheet is built with the form in it now, in this task. */
    if (sheetBodyModule && readyForms.has(id)) return showFormSheet(id, sheetBodyModule)
    let opened = false
    const go = (Body: FormSheetBodyComponent | null) => {
      if (opened) return
      opened = true
      showFormSheet(id, Body)
    }
    warmForm(id).then(() => go(sheetBodyModule), () => go(null))
    window.setTimeout(() => go(null), FORM_READY_MS)
  }

  const showFormSheet = (id: string, Ready: FormSheetBodyComponent | null) => {
    const leaving: { href: string | null } = { href: null }
    const leave = (href: string | null) => {
      leaving.href = href
      blockSheet.close()
    }
    const title = (sourceBlock || "").trim() || tt("Form")
    const props = {
      formId: id,
      source,
      preview: inPreview,
      sourceBlock,
      shownTitle: title,
      onSubmitted: chat ? (answers: Record<string, unknown>, fields: { id: string; type?: string }[]) => leave(actionHref(action, { ...vars, ...formVars(fields, answers) })) : undefined,
      onUnavailable: chat ? () => leave(actionHref(action, vars)) : undefined,
    }
    blockSheet.open({
      blockId: sourceBlock || id,
      title,
      body: Ready ? (
        <Ready {...props} />
      ) : (
        <Suspense fallback={<FormSheetWaiting />}>
          <FormSheetBody {...props} />
        </Suspense>
      ),
      onGone: () => {
        /* The chat, with the answers in its message. The preview never leaves the editor. */
        if (leaving.href && !inPreview) window.location.assign(leaving.href)
      },
    })
  }

  return (
    <>
      <div
        ref={frame}
        /* A pointer over the button, or a finger coming down on it: the form is asked for before the press lands. */
        onPointerEnter={warmable ? () => void warmForm(formId!).catch(() => {}) : undefined}
        onPointerDownCapture={formId && blockSheet.available ? () => void warmForm(formId).catch(() => {}) : undefined}
        onClickCapture={(e) => {
          const link = (e.target as Element).closest("a")
          if (!link) return
          e.preventDefault()
          trigger.current = link
          if (formId && blockSheet.available) return openFormSheet(formId)
          if (formId) return setFormOpen(true)
          setSheetMounted(true)
          step({ type: "open" })
        }}
      >
        {children}
      </div>
      {formOpen && formId ? (
        <Suspense fallback={null}>
          <FormDialog
            onClose={() => setFormOpen(false)}
            formId={formId}
            source={source}
            preview={inPreview}
            sourceBlock={sourceBlock}
            onSubmitted={
              chat
                ? (answers, fields) => {
                    /* The chat, with the answers in its message. The preview never leaves the editor. */
                    const href = actionHref(action, { ...vars, ...formVars(fields, answers) })
                    setFormOpen(false)
                    if (href && !inPreview) window.location.assign(href)
                  }
                : undefined
            }
            onUnavailable={
              chat
                ? () => {
                    /* The questions could not be shown: the chat opens without them, never a visitor stuck on a form that will not load. */
                    const href = actionHref(action, vars)
                    setFormOpen(false)
                    if (href && !inPreview) window.location.assign(href)
                  }
                : undefined
            }
          />
        </Suspense>
      ) : null}
      {product && sheetMounted ? (
        <Suspense fallback={null}>
          <ProductSheet
            open={sheetShown(layer)}
            onClose={() => step({ type: "close" })}
            productId={product.product_id}
            title={product.title || ""}
            image={product.image || null}
            ctaText="Buy now"
            /* The sheet itself checks the product's facts: Buy opens the checkout here only for a product with instant checkout on that does not ship; otherwise it is the checkout page's link. */
            instant
            onBuy={(variantId) => step({ type: "buy", variantId })}
            onClosed={() => step({ type: "sheet-gone" })}
          />
        </Suspense>
      ) : null}
      {product && checkout ? (
        <Suspense fallback={null}>
          <InstantCheckout
            productId={product.product_id}
            title={product.title || ""}
            productImage={product.image || null}
            sellerName={seller?.name ?? null}
            sellerAvatar={seller?.avatarUrl ?? null}
            variantId={checkout.variantId}
            dark={dark}
            themed
            origin={pageOrigin}
            onClose={() => step({ type: "close" })}
            onBack={checkout.fromSheet ? () => step({ type: "back" }) : null}
            returnFocus={() => trigger.current}
          />
        </Suspense>
      ) : null}
    </>
  )
}
