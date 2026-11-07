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
 *   noneLabel  the words for no action, where the block keeps its own address
 *   url        an address saved before actions existed; read into the model
 *              (lib/forms/actions actionFromUrl) and shown as what it is
 *   showLabel  a field for the button's words (CTA text), kept on the action
 *   types      only these choices, in this order
 *   vars       what {product_name} and {service} mean where this button is,
 *              for the preview of the message
 *
 * FORMS ARE CHOSEN AND MADE HERE (round AL). A form, a booking form and a
 * chat's questions are picked with ./form-picker, which can also start a
 * new form or edit the chosen one's questions over the editor. A WhatsApp
 * or Telegram chat can "Ask a few questions first": the answers are saved
 * as a lead, fill the message's variables, then the chat opens
 * (./action-frame). The phone number has its country beside it, with flag
 * and code (./phone-number-field).
 */
import { useMemo, useRef, useState } from "react"
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_VARIABLES,
  UUID,
  actionFromUrl,
  actionHref,
  telegramTarget,
  whatsappGroupUrl,
  type ActionType,
  type ActionVars,
  type NativeAction,
} from "@/lib/forms/actions"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { Switch } from "@/components/ui/switch"
import { tt } from "@/lib/i18n/text"
import { FormPicker, createForm, useFormsList } from "./form-picker"
import { PhoneNumberField } from "./phone-number-field"

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

/** The message a chat starts with when questions come first: each answer of the "Before a chat" form, in a sentence (lib/forms/templates prechat). */
const PRECHAT_MESSAGE = "Hi, I'm {visitor_name}. It's about {service}. {answer:message}"

export function ActionEditor({
  value,
  onChange,
  allowNone = false,
  noneLabel,
  url,
  showLabel = false,
  types,
  vars,
}: {
  value?: NativeAction
  onChange: (action: NativeAction | undefined) => void
  allowNone?: boolean
  /** The words for "no action": what the block does without one ("Web address" where the block keeps its own address field). */
  noneLabel?: string
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
  const needsForms = (type === "whatsapp" || type === "telegram") && !!a.pre_chat
  const { forms } = useFormsList(needsForms)
  const [asking, setAsking] = useState(false)
  const [askProblem, setAskProblem] = useState<string | null>(null)
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

  /* The country beside the number, with its flag and code, and the number as that country writes it. */
  const phone = <PhoneNumberField phone={String(a.phone ?? "")} country={a.country as string | undefined} label={tt("Phone number")} onChange={(next) => set(next)} />

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

  /*
    ASK A FEW QUESTIONS FIRST. On: the visitor answers a short form on the
    page (saved as a lead), its answers fill the message, then the chat
    opens. The first time, the "Before a chat" form is made for the creator,
    live at once, and the message is written to use its answers; after that
    the switch reuses it. Off: the chat opens straight away.
  */
  const askFirst = async (on: boolean) => {
    setAskProblem(null)
    if (!on) return set({ pre_chat: undefined })
    const kept = forms.find((f) => f.title === "Before we chat" && f.status === "published")
    if (kept) return set({ pre_chat: { form_id: kept.id }, ...(a.message ? {} : { message: PRECHAT_MESSAGE }) })
    setAsking(true)
    const made = await createForm("prechat", true)
    setAsking(false)
    if (!made.form) return setAskProblem(made.missing ? tt("Forms are not switched on for this store yet. They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates).") : made.error)
    set({ pre_chat: { form_id: made.form.id }, ...(a.message ? {} : { message: PRECHAT_MESSAGE }) })
  }
  const preChat = (
    <div className="space-y-3 rounded-lg border border-[#eceef1] p-3" data-pre-chat={a.pre_chat ? "on" : "off"}>
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[#1a1a2e]">{tt("Ask a few questions first")}</span>
          <span className="block text-xs text-[#6b7280]">{tt("Answers are saved in Leads and added to the message.")}</span>
        </span>
        <Switch checked={!!a.pre_chat} disabled={asking} onCheckedChange={(on) => void askFirst(on)} aria-label={tt("Ask a few questions first")} />
      </label>
      {a.pre_chat ? <FormPicker kind="prechat" label={tt("Questions")} value={a.pre_chat.form_id || ""} allowEmpty={false} onChange={(id) => set({ pre_chat: id ? { form_id: id } : undefined })} /> : null}
      {askProblem ? (
        <p role="alert" className="text-xs text-[#b42318]">
          {askProblem}
        </p>
      ) : null}
    </div>
  )

  const formSelect = (label: string, key: "form_id", bookingFirst = false) => (
    <FormPicker kind={bookingFirst ? "booking" : "form"} label={label} value={String(a[key] || "")} onChange={(id) => set({ [key]: id })} />
  )

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
            setAskProblem(null)
            setBookingMode("form")
            onChange(e.target.value ? empty(e.target.value, { label: a.label }) : undefined)
          }}
        >
          <option value="">{noneLabel || (allowNone ? "Success message only" : "Existing link")}</option>
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
