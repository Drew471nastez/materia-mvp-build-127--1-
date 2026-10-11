"use client"

/**
 * ===========================================================================
 *  THE CHECKOUT'S OWN FORM PIECES
 * ===========================================================================
 * Drawn after Stripe Checkout: slim boxes on a hairline border with a
 * shadow you feel more than see, labels small and grey above them, and
 * placeholders a light grey so a typed value is never mistaken for one.
 *
 * 44px boxes. 16px text on a phone, because iOS zooms the whole page into
 * any input set smaller and a checkout that jumps when you tap it feels
 * broken; 15px on a computer, where nothing zooms and 16 reads large.
 *
 * The same values are handed to Stripe's own fields (`stripeAppearance` in
 * stripe-pay.tsx) so the card number and the name box beside it are one
 * family.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"

export const INK = "#1a1a2e"

/* Stripe's own input shadow: a one pixel lip and a soft drop, barely there. */
export const FIELD_SHADOW = "0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(0,0,0,0.02)"

export const inputClass =
  "block h-11 w-full min-w-0 rounded-[8px] border border-[#e1e3e7] bg-white px-3.5 text-[16px] text-[#1a1a2e] shadow-[0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(0,0,0,0.02)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#a2a7b0] hover:border-[#d2d5da] focus:border-[#1a1a2e]/55 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08),0_1px_1px_rgba(0,0,0,0.03)] aria-[invalid=true]:border-[#dc2626] aria-[invalid=true]:shadow-[0_0_0_3px_rgba(220,38,38,0.10)] disabled:bg-[#f7f7f8] disabled:text-[#9ca3af] sm:text-[15px]"

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{children}</h2>
      {aside}
    </div>
  )
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string
  label: string
  error?: string | null
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-[#dc2626]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{hint}</p>
      ) : null}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputClass, className)} {...rest} />
  },
)

/**
 * A square box with a check, the size of a fingertip's target around it.
 *
 * Ticking it moves only opacity and scale: the near-black fill grows out of
 * the box's middle and the check follows it in a beat later with a little
 * give; unticking is the same backwards and quicker, so it never lingers. The
 * box itself sinks a touch while it is pressed, wherever on the row the press
 * lands.
 *
 * A NAMED GROUP, group/check, and not `group`: on a touch screen globals.css
 * switches off every transition inside a `.group` (the hover flash rule
 * under `@media (hover: none)`), which is where this box used to lose its
 * animation on every phone and only ever snapped.
 */
export function CheckRow({
  id,
  checked,
  onChange,
  children,
  invalid,
}: {
  id: string
  checked: boolean
  onChange: (on: boolean) => void
  children: React.ReactNode
  invalid?: boolean
}) {
  return (
    <label htmlFor={id} className="group/check flex cursor-pointer items-start gap-2.5 py-1 text-[14px] leading-[1.45] text-[#4b5563] [-webkit-tap-highlight-color:transparent]">
      <span
        data-check-box=""
        className="relative mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center transition-[scale] duration-150 ease-out group-active/check:scale-[0.9] motion-reduce:transition-none"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={invalid || undefined}
          className={cn(
            "absolute inset-0 m-0 h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border bg-white shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-[border-color] duration-200 ease-out",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
            checked ? "border-[#1a1a2e]" : invalid ? "border-[#dc2626]" : "border-[#c9ccd2] group-hover/check:border-[#9ca3af]",
          )}
        />
        {/* The fill grows from the middle; the tick then draws itself, left to right, like a pen stroke. Out, both simply fade. */}
        <span
          aria-hidden
          data-check-fill=""
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[5px] bg-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(17,17,19,0.22)] transition-[opacity,scale] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            checked ? "scale-100 opacity-100 duration-[220ms]" : "scale-[0.7] opacity-0 duration-[180ms]",
          )}
        />
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none relative h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M20 6 9 17l-5-5"
            pathLength={1}
            className={cn(
              "[stroke-dasharray:1] transition-[stroke-dashoffset,opacity] motion-reduce:transition-none",
              checked
                ? "opacity-100 [stroke-dashoffset:0] delay-[60ms] duration-[260ms] ease-[cubic-bezier(0.65,0,0.35,1)]"
                : "opacity-0 [stroke-dashoffset:1] duration-[140ms] ease-out",
            )}
          />
        </svg>
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  )
}

/**
 * ===========================================================================
 *  OPENS AND CLOSES THE SAME WAY
 * ===========================================================================
 * A piece of the page that folds away (the code field, the tip's choices, the
 * order on a phone). The height goes through grid rows, 0fr to 1fr, which
 * reaches the content's own height without measuring it, and the content
 * fades and settles 4px as it goes, so closing is the opening played
 * backwards rather than a cut.
 *
 * `pad` keeps a 3px margin inside the clip so a focused field's ring is not
 * cut off at the edges; the caller hands it back with a -3px margin around
 * the whole group. `tall` is for a block of several hundred pixels (the
 * order on a phone), which reads as rushed at the short pieces' 260ms.
 */
export function Reveal({
  open,
  children,
  id,
  pad = false,
  tall = false,
  className,
}: {
  open: boolean
  children: React.ReactNode
  id?: string
  pad?: boolean
  tall?: boolean
  className?: string
}) {
  const time = tall ? "duration-[380ms]" : "duration-[260ms]"
  return (
    <div
      id={id}
      data-open={open ? "" : undefined}
      inert={!open}
      aria-hidden={!open || undefined}
      className={cn(
        "grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        time,
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "transition-[translate] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            time,
            open ? "translate-y-0" : tall ? "-translate-y-2" : "-translate-y-1",
            pad && "p-[3px]",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** "OR" between the express buttons and the form, as a rule with a word in it. */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[13px] text-[#6b7280]" aria-hidden>
      <span className="h-px flex-1 bg-[#e5e7eb]" />
      OR
      <span className="h-px flex-1 bg-[#e5e7eb]" />
    </div>
  )
}

/**
 * `late`: fades in only after 250ms. For a wait that is usually over before
 * then (a Back through history lands in well under a tenth of a second), so
 * a quick one shows nothing rather than a flicker, and a slow one still says
 * it is on its way. Written inline because both animations share one
 * `animation` property; the fade is globals.css's checkout-paid-in.
 */
export function Spinner({ className, late = false }: { className?: string; late?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
      style={late ? { animation: "spin 1s linear infinite, checkout-paid-in 180ms ease-out 250ms both" } : undefined}
    />
  )
}

/**
 * The one primary action. Full width, 48px, a small 8px corner, lit along
 * its top edge and sitting on a short shadow, the way Stripe's Pay is.
 */
/**
 * PAY IS ALWAYS IN REACH ON A PHONE (round 21, the owner: "make the Pay button actually sticky, smooth and clean"). The
 * button's own box was a small wrapper at the end of the form, so it scrolled away with everything else. This is that
 * wrapper, and it sticks to the foot of the screen while the form above it scrolls: the page's full width, the home
 * indicator's room under it, and a short white fade above it so the fields pass under it softly. It is a child of the
 * whole payment column, so it settles back into its place at the end of the form. From 1024px, where the form and the
 * summary sit side by side and Pay is in view, it is a plain block again.
 */
export function PayDock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-pay-dock=""
      className={cn(
        "sticky bottom-0 z-20 -mx-5 mt-5 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-4 [background:linear-gradient(to_top,#fff_78%,rgba(255,255,255,0))] sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:p-0 lg:[background:none]",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PayButton({
  children,
  busy,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-pay=""
      className="relative flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#1a1a2e] text-[16px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12),0_3px_8px_-2px_rgba(26,26,46,0.35)] transition-[background-color,scale,opacity] duration-150 hover:bg-[#262640] active:scale-[0.99] active:bg-[#111122] disabled:cursor-not-allowed disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="checkout-rise flex items-start gap-2.5 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[14px] leading-snug text-[#991b1b]">
      <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#dc2626]" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/*
  STRIPE'S WORDMARK, from Font Awesome's brand set (react-icons FaStripe),
  cut to the letters' own box so it sits on the text's baseline.
*/
const STRIPE_WORDMARK =
  "M165 144.7l-43.3 9.2-.2 142.4c0 26.3 19.8 43.3 46.1 43.3 14.6 0 25.3-2.7 31.2-5.9v-33.8c-5.7 2.3-33.7 10.5-33.7-15.7V221h33.7v-37.8h-33.7zm89.1 51.6l-2.7-13.1H213v153.2h44.3V233.3c10.5-13.8 28.2-11.1 33.9-9.3v-40.8c-6-2.1-26.7-6-37.1 13.1zm92.3-72.3l-44.6 9.5v36.2l44.6-9.5zM44.9 228.3c0-6.9 5.8-9.6 15.1-9.7 13.5 0 30.7 4.1 44.2 11.4v-41.8c-14.7-5.8-29.4-8.1-44.1-8.1-36 0-60 18.8-60 50.2 0 49.2 67.5 41.2 67.5 62.4 0 8.2-7.1 10.9-17 10.9-14.7 0-33.7-6.1-48.6-14.2v40c16.5 7.1 33.2 10.1 48.5 10.1 36.9 0 62.3-15.8 62.3-47.8 0-52.9-67.9-43.4-67.9-63.4zM640 261.6c0-45.5-22-81.4-64.2-81.4s-67.9 35.9-67.9 81.1c0 53.5 30.3 78.2 73.5 78.2 21.2 0 37.1-4.8 49.2-11.5v-33.4c-12.1 6.1-26 9.8-43.6 9.8-17.3 0-32.5-6.1-34.5-26.9h86.9c.2-2.3.6-11.6.6-15.9zm-87.9-16.8c0-20 12.3-28.4 23.4-28.4 10.9 0 22.5 8.4 22.5 28.4zm-112.9-64.6c-17.4 0-28.6 8.2-34.8 13.9l-2.3-11H363v204.8l44.4-9.4.1-50.2c6.4 4.7 15.9 11.2 31.4 11.2 31.8 0 60.8-23.2 60.8-79.6.1-51.6-29.3-79.7-60.5-79.7zm-10.6 122.5c-10.4 0-16.6-3.8-20.9-8.4l-.3-66c4.6-5.1 11-8.8 21.2-8.8 16.2 0 27.4 18.2 27.4 41.4.1 23.9-10.9 41.8-27.4 41.8zm-126.7 33.7h44.6V183.2h-44.6z"

/**
 * "Powered by stripe · Terms · Privacy", one quiet line just under the main
 * button, as Stripe Checkout signs its own. On every checkout, a free one
 * too, so the page ends the same way whatever it costs. Terms and Privacy
 * are the site's own pages (app/terms, app/privacy), in a new tab so the
 * order is still here after reading them.
 */
export function PoweredByStripe() {
  const link = "rounded-[4px] px-1 py-1.5 transition-colors hover:text-[#1a1a2e] focus-visible:outline-2 focus-visible:outline-[#1a1a2e]/40"
  return (
    <p data-powered-by="" className="mt-3.5 flex flex-wrap items-center justify-center gap-x-1 text-[12.5px] text-[#8b919a]">
      <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className={cn(link, "inline-flex items-center gap-1")}>
        Powered by
        <svg viewBox="0 120 640 272" aria-label="Stripe" role="img" className="mt-[1px] h-[14px] w-auto" fill="currentColor">
          <path d={STRIPE_WORDMARK} />
        </svg>
      </a>
      <span aria-hidden className="text-[#c4c8ce]">
        ·
      </span>
      <a href="/terms" target="_blank" className={link}>
        Terms
      </a>
      <span aria-hidden className="text-[#c4c8ce]">
        ·
      </span>
      <a href="/privacy" target="_blank" className={link}>
        Privacy
      </a>
    </p>
  )
}

/*
  THE CURRENCY THE CARD IS CHARGED IN (lib/checkout/currency PLATFORM_CURRENCY,
  the same NEXT_PUBLIC_PLATFORM_CURRENCY every PaymentIntent is made in, through
  lib/payments/fees/currency-rules platformChargeCurrency). It said "USD" here
  whatever was charged; production charges USD (the live build inlines it), so
  nothing changes there, and a deployment charging lei now shows lei too.
*/
export const CHECKOUT_CURRENCY = PLATFORM_CURRENCY

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: CHECKOUT_CURRENCY.toUpperCase() }).format((cents || 0) / 100)
