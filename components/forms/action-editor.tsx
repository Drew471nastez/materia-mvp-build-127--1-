"use client"
/**
 * What a button does, chosen once for every OnePage destination (lib/forms/actions).
 *
 * The creator picks what happens and gives only what that needs: a number
 * for WhatsApp, a username for Telegram, an address for email. The address
 * itself is built for them and shown underneath, so they can see where the
 * button goes without writing it.
 *
 * PROPS ARE A CONTRACT. Link blocks, form completion (components/forms/
 * forms-manager), the form reference editor and the rebuilt block editors
 * all use `value`, `onChange` and `allowNone`. Everything added since is
 * optional:
 *   url        an address saved before actions existed; read into the model
 *              (lib/forms/actions actionFromUrl) and shown as what it is
 *   showLabel  a field for the button's words (CTA text), kept on the action
 *   types      only these choices, in this order
 *   vars       what {product_name} and {service} mean where this button is,
 *              for the preview of the message
 */
import { useEffect, useMemo, useRef, useState } from "react"
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_VARIABLES,
  UUID,
  actionFromUrl,
  actionHref,
  e164,
  internationalPhone,
  telegramTarget,
  whatsappGroupUrl,
  type ActionType,
  type ActionVars,
  type NativeAction,
} from "@/lib/forms/actions"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { countryOf, countryToSave } from "@/lib/account/country"
import { callingCode, countryOfInternational, digitsFromKept, examplePhone, formatNational, fullNumber, nationalDigits } from "@/lib/account/phone"

const input =
  "w-full rounded-lg border border-[#e3e4e8] bg-white px-3 py-2 text-sm text-[#1a1a2e] outline-none focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]"
const labelCls = "block space-y-1 text-xs font-medium text-[#4b5563]"
const hint = "text-xs text-[#6b7280]"
const problem = "text-xs font-medium text-[#b54708]"

const CHOICES: [ActionType, string][] = [
  ["url", "Web address"],
  ["whatsapp", "WhatsApp chat"],
  ["whatsapp_group", "WhatsApp group"],
  ["telegram", "Telegram"],
  ["email", "Email"],
  ["phone", "Phone call"],
  ["sms", "Text message"],
  ["product", "Storelib product"],
  ["form", "Form or quiz"],
  ["booking", "Booking"],
  ["internal", "Page on this site"],
]

const empty = (type: string, keep?: { label?: string }): NativeAction => {
  const label = keep?.label ? { label: keep.label } : {}
  switch (type) {
    case "whatsapp":
      return { type, phone: "", message: "", ...label }
    case "whatsapp_group":
      return { type, url: "", ...label }
    case "telegram":
      return { type, target: "", message: "", ...label }
    case "email":
      return { type, email: "", subject: "", message: "", ...label }
    case "phone":
      return { type, phone: "", ...label }
    case "sms":
      return { type, phone: "", message: "", ...label }
    case "product":
      return { type, product_id: "", open: "sheet", ...label }
    case "form":
      return { type, form_id: "", ...label }
    case "booking":
      return { type, form_id: "", ...label }
    case "internal":
      return { type, path: "", ...label }
    default:
      return { type: "url", url: "", ...label }
  }
}

type FormRow = {
  id: string
  title: string
  status: string
  draft?: { fields?: { id: string; label?: string; type?: string }[]; kind?: string } | null
  published?: { fields?: { id: string; label?: string; type?: string }[]; kind?: string } | null
}

/** The creator's forms, read once per editor and only when a choice needs them. */
function useForms(needed: boolean) {
  const [forms, setForms] = useState<FormRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!needed || forms) return
    let live = true
    fetch("/api/forms", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b.error || "Forms could not be loaded.")
        if (live) setForms(b.forms || [])
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Forms could not be loaded.")
      })
    return () => {
      live = false
    }
  }, [needed, forms])
  return { forms: forms || [], error }
}

/** The visitor's country from the browser, for a number with no code yet. */
function browserCountry(): string {
  if (typeof navigator === "undefined") return "US"
  const region = (navigator.language || "").split("-")[1]
  return region && callingCode(region) ? region.toUpperCase() : "US"
}

export function ActionEditor({
  value,
  onChange,
  allowNone = false,
  url,
  showLabel = false,
  types,
  vars,
}: {
  value?: NativeAction
  onChange: (action: NativeAction | undefined) => void
  allowNone?: boolean
  url?: string | null
  showLabel?: boolean
  types?: ActionType[]
  vars?: ActionVars
}) {
  /* A link saved before actions existed is shown as the action its address is. */
  const legacy = useMemo(() => (!value && url ? actionFromUrl(url) : null), [value, url])
  const current: NativeAction | undefined = value ?? (legacy && legacy.type !== "url" ? legacy : undefined)
  const type = current?.type || ""
  const a = (current || {}) as Record<string, any>
  const products = useCreatorProducts(type === "product")
  const needsForms = type === "form" || type === "booking" || ((type === "whatsapp" || type === "telegram") && !!a.pre_chat)
  const [askFirst, setAskFirst] = useState(!!a.pre_chat)
  /* A number being typed with its own code, before the code is known. */
  const [typing, setTyping] = useState<string | null>(null)
  const { forms, error } = useForms(needsForms || askFirst)
  const message = useRef<HTMLTextAreaElement>(null)
  const [bookingMode, setBookingMode] = useState<"form" | "url">(a.url && !a.form_id ? "url" : "form")

  const set = (patch: Record<string, unknown>) => onChange({ ...(current as object), ...patch } as NativeAction)
  const choices = (types?.length ? CHOICES.filter(([t]) => types.includes(t)) : CHOICES)
  const href = current ? actionHref(current, vars) : null

  const text = (key: string, label: string, opts: { placeholder?: string; inputMode?: "email" | "url" | "text"; max?: number } = {}) => (
    <label className={labelCls}>
      {label}
      <input
        className={input}
        value={String(a[key] ?? "")}
        maxLength={opts.max ?? 2048}
        placeholder={opts.placeholder}
        inputMode={opts.inputMode}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </label>
  )

  /* The country beside the number: the saved one, else the one the number's code says, else the browser's. */
  const phoneCountry = (a.country as string) || (a.phone ? countryOfInternational(String(a.phone), []) : null) || browserCountry()
  const phone = (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-[#4b5563]">Phone number</span>
      <div className="grid gap-2">
        {/* A new country keeps the digits typed and puts its own code in front. */}
        <CountryPicker
          value={countryToSave(phoneCountry)}
          onChange={(name) => {
            const next = countryOf(name)
            if (!next) return
            set({ country: next, phone: e164(fullNumber(digitsFromKept(String(a.phone ?? ""), phoneCountry), next)) })
          }}
        />
        {/*
          The country's code before the field, the number grouped as that
          country writes it. A number typed or pasted with its code (+44 ...,
          0044 ...) is kept as typed until its code is known, then the
          country follows it.
        */}
        <div
          data-phone-field=""
          className="flex h-10 w-full items-stretch overflow-hidden rounded-lg border border-[#e3e4e8] bg-white text-sm text-[#1a1a2e] focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]"
        >
          {!typing && callingCode(phoneCountry) ? (
            <span data-phone-prefix={`+${callingCode(phoneCountry)}`} className="flex shrink-0 select-none items-center border-r border-[#eceef1] px-3 tabular-nums text-[#4b5563]">
              +{callingCode(phoneCountry)}
            </span>
          ) : null}
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            aria-label="Phone number"
            aria-invalid={!!a.phone && !internationalPhone(a.phone)}
            placeholder={examplePhone(phoneCountry)}
            className="min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-[#9ca3af]"
            value={typing ?? formatNational(digitsFromKept(String(a.phone ?? ""), phoneCountry), phoneCountry)}
            onChange={(e) => {
              const v = e.target.value
              if (/^\s*(\+|00)/.test(v)) {
                const found = countryOfInternational(v, [phoneCountry])
                if (!found) return setTyping(v.slice(0, 24))
                setTyping(null)
                set({ country: found, phone: e164(fullNumber(nationalDigits(v, found), found)) })
                return
              }
              setTyping(null)
              set({ country: phoneCountry, phone: e164(fullNumber(nationalDigits(v, phoneCountry), phoneCountry)) })
            }}
            onBlur={() => setTyping(null)}
          />
        </div>
      </div>
      {a.phone && !internationalPhone(a.phone) ? <p className={problem}>Enter the whole number, without a leading 0.</p> : null}
    </div>
  )

  const insert = (token: string) => {
    const el = message.current
    const before = String(a.message ?? "")
    const at = el ? el.selectionStart ?? before.length : before.length
    const end = el ? el.selectionEnd ?? at : at
    const next = (before.slice(0, at) + token + before.slice(end)).slice(0, 4000)
    set({ message: next })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(at + token.length, at + token.length)
    })
  }
  const preChatForm = forms.find((f) => f.id === a.pre_chat?.form_id)
  const answerFields = (preChatForm?.published?.fields || preChatForm?.draft?.fields || []).slice(0, 8)

  const messageBox = (label: string) => (
    <div className="space-y-1.5">
      <label className={labelCls}>
        {label}
        <textarea
          ref={message}
          className={input}
          rows={3}
          maxLength={4000}
          placeholder="Optional"
          value={String(a.message ?? "")}
          onChange={(e) => set({ message: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Insert a variable">
        {[...TEMPLATE_VARIABLES.map((v) => ({ token: v.token, label: v.label })), ...answerFields.map((f) => ({ token: `{answer:${f.id}}`, label: f.label || f.id }))].map((v) => (
          <button
            key={v.token}
            type="button"
            onClick={() => insert(v.token)}
            className="rounded-md border border-[#e3e4e8] bg-white px-2 py-1 text-[12px] text-[#4b5563] hover:border-[#c9cbd1] hover:text-[#1a1a2e]"
          >
            {v.label}
          </button>
        ))}
        <select
          aria-label="Start from a template"
          className="ml-auto rounded-md border-0 bg-transparent py-1 text-xs font-medium text-[#6b7280] outline-none hover:text-[#1a1a2e]"
          value=""
          onChange={(e) => {
            const t = MESSAGE_TEMPLATES.find((m) => m.id === e.target.value)
            if (t) set({ message: t.text })
          }}
        >
          <option value="">Templates</option>
          {MESSAGE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )

  const preChat = (
    <label className={labelCls}>
      Before the chat opens
      <select
        className={input}
        value={a.pre_chat?.form_id || ""}
        onFocus={() => setAskFirst(true)}
        onPointerDown={() => setAskFirst(true)}
        onChange={(e) => set({ pre_chat: e.target.value ? { form_id: e.target.value } : undefined })}
      >
        <option value="">Open it straight away</option>
        {forms.map((f) => (
          <option key={f.id} value={f.id}>
            Ask first: {f.title || "Unnamed form"}
            {f.status !== "published" ? " (draft)" : ""}
          </option>
        ))}
      </select>
    </label>
  )

  const formSelect = (label: string, key: "form_id", bookingFirst = false) => {
    const list = bookingFirst
      ? [...forms].sort((x, y) => Number((y.published?.kind || y.draft?.kind) === "booking") - Number((x.published?.kind || x.draft?.kind) === "booking"))
      : forms
    return (
      <>
        <label className={labelCls}>
          {label}
          <select className={input} value={String(a[key] || "")} onChange={(e) => set({ [key]: e.target.value })}>
            <option value="">Choose a form</option>
            {list.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title || "Unnamed form"}
                {f.status !== "published" ? " (draft)" : ""}
              </option>
            ))}
          </select>
        </label>
        <a href="/app/audience/forms" target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium text-[#4b5563] underline">
          Create or edit forms
        </a>
        {error ? (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </>
    )
  }

  /* Where it goes, shown once it can go anywhere: the address, short. */
  const shown = href && /^(https?:\/\/(wa\.me|t\.me|chat\.whatsapp\.com|whatsapp\.com)|mailto:|tel:|sms:)/.test(href)
    ? href.split("?")[0].replace(/^https:\/\//, "").replace(/^(mailto|tel|sms):/, "")
    : null

  return (
    <div className="space-y-3" data-native-action-editor="" data-action-type={type || "none"}>
      <label className={labelCls}>
        Action
        <select
          aria-label="Action type"
          className={input}
          value={type}
          onChange={(e) => {
            setAskFirst(false)
            setBookingMode("form")
            onChange(e.target.value ? empty(e.target.value, { label: a.label }) : undefined)
          }}
        >
          {allowNone ? <option value="">Success message only</option> : <option value="">Existing link</option>}
          {choices.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {type === "url" ? text("url", "Web address", { placeholder: "https://", inputMode: "url" }) : null}
      {type === "appointment" ? text("url", "Booking address", { placeholder: "https://", inputMode: "url" }) : null}
      {type === "internal" ? text("path", "Path or section", { placeholder: "/shop or #faq", max: 512 }) : null}

      {type === "whatsapp" || type === "phone" || type === "sms" ? phone : null}
      {type === "whatsapp" ? (
        <>
          {messageBox("Message")}
          {preChat}
        </>
      ) : null}
      {type === "sms" ? messageBox("Message") : null}

      {type === "whatsapp_group" ? (
        <>
          {text("url", "Group invite link", { placeholder: "https://chat.whatsapp.com/…", inputMode: "url", max: 300 })}
          {a.url && !whatsappGroupUrl(a.url) ? <p className={problem}>Paste the invite link from WhatsApp, starting with chat.whatsapp.com.</p> : null}
        </>
      ) : null}

      {type === "telegram" ? (
        <>
          {text("target", "Username or link", { placeholder: "@username or t.me/…", max: 300 })}
          {a.target && !telegramTarget(a.target) ? <p className={problem}>Use a username like @storelib, or a t.me link.</p> : null}
          {telegramTarget(a.target)?.kind === "username" || !a.target ? messageBox("Message") : null}
          {preChat}
        </>
      ) : null}

      {type === "email" ? (
        <>
          {text("email", "Email address", { placeholder: "you@example.com", inputMode: "email", max: 254 })}
          {text("subject", "Subject", { max: 300 })}
          {messageBox("Message")}
        </>
      ) : null}

      {type === "product" ? (
        <>
          <label className={labelCls}>
            Product
            <select
              className={input}
              value={String(a.product_id || "")}
              onChange={(e) => {
                const p = products?.find((x) => x.id === e.target.value) as { id: string; title?: string; slug?: string; thumbnail_url?: string | null } | undefined
                set({ product_id: e.target.value, title: p?.title || undefined, slug: p?.slug || undefined, image: p?.thumbnail_url || undefined })
              }}
            >
              <option value="">Choose a product</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-[#4b5563]">Opens</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["sheet", "Product details"],
                  ["checkout", "Checkout"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm ${(a.open || "sheet") === v ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-[#e3e4e8] text-[#6b7280]"}`}>
                  <input type="radio" className="sr-only" name="action-product-open" checked={(a.open || "sheet") === v} onChange={() => set({ open: v })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      {type === "form" ? formSelect("Form or quiz", "form_id") : null}

      {type === "booking" ? (
        <>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Booking with">
            {(
              [
                ["form", "Booking form"],
                ["url", "Booking page"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={bookingMode === v}
                onClick={() => {
                  setBookingMode(v)
                  onChange((v === "form" ? { type: "booking", form_id: "", ...(a.label ? { label: a.label } : {}) } : { type: "booking", url: "", ...(a.label ? { label: a.label } : {}) }) as NativeAction)
                }}
                className={`min-h-10 rounded-lg border px-3 text-sm ${bookingMode === v ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-[#e3e4e8] text-[#6b7280]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {bookingMode === "form" ? formSelect("Booking form", "form_id", true) : text("url", "Booking address", { placeholder: "https://cal.com/…", inputMode: "url" })}
        </>
      ) : null}

      {showLabel && current ? text("label", "Button text", { max: 80 }) : null}

      {shown ? (
        <p className={`${hint} break-all`} data-action-opens={href}>
          Opens {shown}
        </p>
      ) : null}
      {current && !actionHref(current) && !(type === "booking" && !a.form_id && !a.url) ? (
        <p className={hint}>Complete the details above to make this button work.</p>
      ) : null}
      {type === "product" && a.product_id && !UUID.test(a.product_id) ? <p className={problem}>Choose the product again.</p> : null}
    </div>
  )
}
