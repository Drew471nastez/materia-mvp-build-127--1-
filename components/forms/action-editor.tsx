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
 *
 * ROUND AN, THE OWNER ON 125.png: the Action, Templates, Product and
 * Questions lists are Storelib's ChoicePicker (components/ui/choice-list), a
 * popover on a computer and the shared sheet on a phone, never the native
 * select. Every field is the OnePage editor's field (./fields). The variable
 * chips sit 10px under the message, wrap, and go in where the caret was
 * (with a space either side when the words around need one), and a keyboard
 * that is up stays up. A template replaces the message with a short fade,
 * and Undo puts back what was there for a few seconds.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { CalendarDays, CircleCheck, ClipboardList, Hash, Link2, Mail, MessageSquare, Phone, Plus, ShoppingBag, Users } from "lucide-react"
import { LinkIcon, SocialIcon } from "@/components/onepage/brand-icons"
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_VARIABLES,
  UUID,
  actionFromUrl,
  actionHref,
  fillTemplate,
  slotVars,
  telegramTarget,
  templateVariablesIn,
  whatsappGroupUrl,
  type ActionType,
  type ActionVars,
  type NativeAction,
} from "@/lib/forms/actions"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { Segmented, Switch } from "@/components/onepage/editor-kit"
import { ChoicePicker, type Choice } from "@/components/ui/choice-list"
import { tt } from "@/lib/i18n/text"
import { insertAtCaret } from "@/lib/forms/caret"
import { cn } from "@/lib/utils"
import { AREA, ERROR, FIELD, FIELD_STACK, HINT, LABEL, PROBLEM } from "./fields"
import { FormPicker, createForm, useFormsList } from "./form-picker"
import { PhoneNumberField } from "./phone-number-field"

/** The choices, in the creator's language. */
const choiceWords = (): Record<ActionType, string> => ({
  url: tt("Web address"),
  whatsapp: tt("WhatsApp chat"),
  whatsapp_group: tt("WhatsApp group"),
  telegram: tt("Telegram"),
  email: tt("Email"),
  phone: tt("Phone call"),
  sms: tt("Text message"),
  product: tt("Storelib product"),
  form: tt("Form or quiz"),
  booking: tt("Booking"),
  appointment: tt("Booking page"),
  internal: tt("Page on this site"),
})

const ORDER: ActionType[] = ["url", "whatsapp", "whatsapp_group", "telegram", "email", "phone", "sms", "product", "form", "booking", "internal"]

/*
  Round AP: no choice is ever drawn as a crossed circle. "No action" is what the block does by itself: its own
  address (the link mark), its booking page (Calendly's mark, or a calendar for Cal.com and the rest), or, after a form, the
  success message alone (a tick). The owner read the crossed circle beside a Calendly link as "blocked".
*/
const ICONS: Record<string, ReactNode> = {
  done: <CircleCheck className="h-4 w-4" />,
  calendly: <LinkIcon name="calendly" size={16} tone="brand" />,
  url: <Link2 className="h-4 w-4" />,
  whatsapp: <SocialIcon platform="whatsapp" size={16} color="#25D366" />,
  whatsapp_group: <Users className="h-4 w-4" />,
  telegram: <SocialIcon platform="telegram" size={16} color="#26A5E4" />,
  email: <Mail className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  product: <ShoppingBag className="h-4 w-4" />,
  form: <ClipboardList className="h-4 w-4" />,
  booking: <CalendarDays className="h-4 w-4" />,
  appointment: <CalendarDays className="h-4 w-4" />,
  internal: <Hash className="h-4 w-4" />,
}

/** An action's mark: a small square with its icon, the same in the list and in the field. */
function ActionMark({ type }: { type: string }) {
  return (
    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]" data-action-mark={type || "none"}>
      {ICONS[type] ?? ICONS.url}
    </span>
  )
}

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
/* The answer to "Anything else?" goes last, as the visitor wrote it. */
const ANSWER_TOKEN = "{answer:message}"
const prechatMessage = () => [tt("Hi, I'm {visitor_name}. It's about {service}.", { visitor_name: "{visitor_name}", service: "{service}" }), ANSWER_TOKEN].join(" ")

/* The variables keep their braces in every language: tt() is handed each one as itself. */
const KEEP = { visitor_name: "{visitor_name}", product_name: "{product_name}", service: "{service}", name: "{name}", date: "{date}", time: "{time}" }

/** The starting messages (lib/forms/actions MESSAGE_TEMPLATES), in the creator's language. */
const templateWords = (): Record<string, { label: string; text: string }> => ({
  hello: { label: tt("Say hello"), text: tt("Hi, I found you on your page and have a question.") },
  product: { label: tt("Ask about a product"), text: tt("Hi, I'm interested in {product_name}. Is it available?", KEEP) },
  booking: { label: tt("Book a service"), text: tt("Hi, I'd like to book {service}. When are you free?", KEEP) },
  intro: { label: tt("Introduce the visitor"), text: tt("Hi, my name is {visitor_name}. I'd like to know more about {service}.", KEEP) },
})

const variableWords = (): Record<string, string> => ({
  "{name}": tt("Name"),
  "{service}": tt("Service"),
  "{product_name}": tt("Product"),
  "{date}": tt("Date"),
  "{time}": tt("Time"),
})

/** What each variable puts in the message (lib/forms/actions TEMPLATE_VARIABLES), in the creator's language. */
const variableMeanings = (): Record<string, string> => ({
  "{name}": tt("The visitor's name, when your questions ask for it"),
  "{service}": tt("The service you type below, else what the visitor picks in your questions, else this button's words"),
  "{product_name}": tt("The product this button is for"),
  "{date}": tt("The day the visitor picks: a booking form's time, or a date question"),
  "{time}": tt("The time the visitor picks in a booking form, or a time question"),
})

/** A message filled with example values, so the creator reads what a visitor sends. Tomorrow at 3:30 in the afternoon, where the creator is. */
function exampleMessage(text: string, vars: ActionVars | undefined, service: unknown): string {
  const at = new Date()
  at.setDate(at.getDate() + 1)
  at.setHours(15, 30, 0, 0)
  let zone = "UTC"
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {}
  const typed = typeof service === "string" && service.trim() ? service.trim() : null
  return fillTemplate(text, {
    visitor_name: tt("Alex"),
    service: typed || vars?.service || tt("a haircut"),
    product_name: vars?.product_name || tt("the linen shirt"),
    ...slotVars(at.toISOString(), zone),
  })
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

export { insertAtCaret }

export function ActionEditor({
  value,
  onChange,
  allowNone = false,
  noneLabel,
  noneMark,
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
  /** Round AP: the mark for "no action" (an action type, or "calendly" or "done"). The link mark by default, a tick for a form's success message. */
  noneMark?: string
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
  /* Where the caret was in the message, kept while a chip or the template list has the press. */
  const caret = useRef<[number, number] | null>(null)
  const [undo, setUndo] = useState<string | null>(null)
  const [bookingMode, setBookingMode] = useState<"form" | "url">(a.url && !a.form_id ? "url" : "form")
  const ids = useId()
  useEffect(() => {
    if (undo === null) return
    const t = window.setTimeout(() => setUndo(null), 6000)
    return () => window.clearTimeout(t)
  }, [undo])

  const set = (patch: Record<string, unknown>) => onChange({ ...(current as object), ...patch } as NativeAction)
  const words = choiceWords()
  const allowed = types?.length ? ORDER.filter((t) => types.includes(t)) : ORDER
  const noneWords = noneLabel || (allowNone ? tt("Success message only") : tt("Existing link"))
  const none = noneMark || (allowNone && !noneLabel ? "done" : "url")
  const actionChoices: Choice[] = [{ value: "", label: noneWords }, ...allowed.map((t) => ({ value: t, label: words[t] }))]
  const href = current ? actionHref(current, vars) : null

  const text = (key: string, label: string, opts: { placeholder?: string; inputMode?: "email" | "url" | "text"; max?: number } = {}) => (
    <label className={FIELD_STACK}>
      <span className={LABEL}>{label}</span>
      <input
        className={FIELD}
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

  const keepCaret = () => {
    const el = message.current
    if (el) caret.current = [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]
  }

  const insert = (token: string) => {
    const el = message.current
    const before = String(a.message ?? "")
    const focused = !!el && document.activeElement === el
    const [at, end] = focused && el ? [el.selectionStart ?? before.length, el.selectionEnd ?? before.length] : caret.current ?? [before.length, before.length]
    const next = insertAtCaret(before, token, at, end)
    set({ message: next.text })
    caret.current = [next.caret, next.caret]
    /* The keyboard stays as it was: up when typing, down when a chip was the first thing pressed. */
    if (focused) requestAnimationFrame(() => el?.setSelectionRange(next.caret, next.caret))
  }

  const applyTemplate = (id: string) => {
    const t = templateWords()[id]
    if (!t) return
    const before = String(a.message ?? "")
    set({ message: t.text })
    setUndo(before.trim() && before !== t.text ? before : null)
    caret.current = [t.text.length, t.text.length]
    const el = message.current
    if (el && !reducedMotion() && typeof el.animate === "function") el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" })
  }

  const preChatForm = forms.find((f) => f.id === a.pre_chat?.form_id)
  const answerFields = (preChatForm?.published?.fields || preChatForm?.draft?.fields || []).slice(0, 8)
  const varWords = variableWords()
  const varMeanings = variableMeanings()
  const used = templateVariablesIn(a.message, a.subject)
  const example = used.length && typeof a.message === "string" && a.message.trim() ? exampleMessage(a.message, vars, a.service) : ""
  const templates = templateWords()
  const templateChoices: Choice[] = MESSAGE_TEMPLATES.map((m) => ({ value: m.id, label: templates[m.id]?.label ?? m.label, detail: templates[m.id]?.text ?? m.text }))
  const messageId = `${ids}-message`

  const messageBox = (label: string) => (
    <div data-message-box="">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <label htmlFor={messageId} className={LABEL}>
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-1">
          {undo !== null ? (
            <button
              type="button"
              data-template-undo=""
              className="h-8 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] outline-none hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]"
              onClick={() => {
                set({ message: undo })
                setUndo(null)
              }}
            >
              {tt("Undo")}
            </button>
          ) : null}
          <div data-template-picker="">
            <ChoicePicker
              name="message-template"
              title={tt("Templates")}
              choices={templateChoices}
              value={null}
              onChange={applyTemplate}
              placeholder={tt("Search templates")}
              fieldLabel={tt("Templates")}
              searchable={false}
              align="end"
              fieldClassName="h-8 w-auto gap-1 rounded-lg border-0 bg-transparent px-2 text-[13px] font-medium text-[#4b5563] shadow-none hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:border-0"
            />
          </div>
        </div>
      </div>
      <textarea
        ref={message}
        id={messageId}
        className={AREA}
        rows={3}
        maxLength={4000}
        placeholder={tt("Optional")}
        value={String(a.message ?? "")}
        onSelect={keepCaret}
        onBlur={keepCaret}
        onChange={(e) => {
          setUndo(null)
          set({ message: e.target.value })
        }}
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={tt("Insert a variable")} data-variable-chips="">
        {[...TEMPLATE_VARIABLES.map((v) => ({ token: v.token as string, label: varWords[v.token] ?? v.label, means: varMeanings[v.token] ?? v.means })), ...answerFields.map((f) => ({ token: `{answer:${f.id}}`, label: f.label || f.id, means: tt("The visitor's answer to this question") }))].map((v) => (
          <button
            key={v.token}
            type="button"
            data-variable={v.token}
            title={`${v.token}: ${v.means}`}
            /* The press does not take the focus: the caret, and a keyboard that is up, stay in the message. */
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(v.token)}
            className="inline-flex h-8 max-w-full items-center gap-1 rounded-lg border border-[#e3e4e8] bg-white pl-2 pr-2.5 text-[13px] text-[#4b5563] outline-none transition-colors duration-100 hover:border-[#c9cbd1] hover:text-[#1a1a2e] active:bg-[#f7f7f8] focus-visible:border-[#1a1a2e] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]"
          >
            <Plus aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
            <span className="truncate">{v.label}</span>
          </button>
        ))}
      </div>
      {/*
        WHAT EACH ONE PUTS IN. Only for the variables the message uses, one
        line each, then the message as a visitor would send it, with example
        values. {service} gets its own field: the service this button books.
      */}
      {used.length ? (
        <div className="mt-3 space-y-1.5" data-variable-meanings="">
          <dl className="space-y-1.5">
            {used.map((token) => (
              <div key={token} className="flex min-w-0 gap-2 text-[12.5px] leading-[1.45]" data-variable-meaning={token}>
                <dt className="shrink-0 font-medium text-[#1a1a2e]">{token}</dt>
                <dd className="min-w-0 text-[#6b7280]">{varMeanings[token]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12.5px] leading-[1.45] text-[#6b7280]">{tt("One with nothing to put in is left out of the message.")}</p>
        </div>
      ) : null}
      {used.includes("{service}") ? <div className="mt-3" data-variable-service="">{text("service", tt("Service"), { placeholder: tt("Haircut"), max: 120 })}</div> : null}
      {example ? (
        <p className="mt-3 rounded-xl bg-[#f6f6f7] px-3 py-2.5 text-[13px] leading-[1.45] text-[#4b5563]" data-message-example="">
          <span className="block text-[12px] font-medium text-[#6b7280]">{tt("Example")}</span>
          <span className="whitespace-pre-line break-words">{example}</span>
        </p>
      ) : null}
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
    if (kept) return set({ pre_chat: { form_id: kept.id }, ...(a.message ? {} : { message: prechatMessage() }) })
    setAsking(true)
    const made = await createForm("prechat", true)
    setAsking(false)
    if (!made.form) return setAskProblem(made.missing ? tt("Forms are not switched on for this store yet. They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates).") : made.error)
    set({ pre_chat: { form_id: made.form.id }, ...(a.message ? {} : { message: prechatMessage() }) })
  }
  const preChat = (
    <div className="space-y-3 border-t border-[#eef0f2] pt-4" data-pre-chat={a.pre_chat ? "on" : "off"}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Ask a few questions first")}</p>
          <p className={cn(HINT, "mt-0.5")}>{tt("Answers are saved in Leads and added to the message.")}</p>
        </div>
        <Switch checked={!!a.pre_chat} disabled={asking} onChange={(on) => void askFirst(on)} label={tt("Ask a few questions first")} />
      </div>
      {a.pre_chat ? <FormPicker kind="prechat" label={tt("Questions")} value={a.pre_chat.form_id || ""} allowEmpty={false} onChange={(id) => set({ pre_chat: id ? { form_id: id } : undefined })} /> : null}
      {askProblem ? (
        <p role="alert" className={ERROR}>
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

  const productChoices = useMemo<Choice[]>(() => (products || []).map((p) => ({ value: p.id, label: p.title || tt("Untitled product") })), [products])
  const productThumb = useMemo(() => new Map((products || []).map((p) => [p.id, p.thumbnail_url || null])), [products])
  const chosenProduct = products?.find((p) => p.id === a.product_id)

  return (
    <div className="space-y-4" data-native-action-editor="" data-action-type={type || "none"}>
      <div className={FIELD_STACK}>
        <span className={LABEL}>{tt("Action")}</span>
        <ChoicePicker
          name="action-type"
          title={tt("Action")}
          choices={actionChoices}
          value={type}
          searchable={false}
          placeholder={tt("Search actions")}
          onChange={(next) => {
            setAskProblem(null)
            setBookingMode("form")
            setUndo(null)
            caret.current = null
            onChange(next ? empty(next, { label: a.label }) : undefined)
          }}
          fieldLabel={type ? (words[type as ActionType] ?? type) : noneWords}
          fieldLeading={<ActionMark type={type || none} />}
          leading={(c) => <ActionMark type={c.value || none} />}
          fieldClassName="pl-2"
        />
      </div>

      {type === "url" ? text("url", tt("Web address"), { placeholder: "https://", inputMode: "url" }) : null}
      {type === "appointment" ? text("url", tt("Booking address"), { placeholder: "https://", inputMode: "url" }) : null}
      {type === "internal" ? text("path", tt("Path or section"), { placeholder: tt("/shop or #faq"), max: 512 }) : null}

      {type === "whatsapp" || type === "phone" || type === "sms" ? phone : null}
      {type === "whatsapp" ? (
        <>
          {messageBox(tt("Message"))}
          {preChat}
        </>
      ) : null}
      {type === "sms" ? messageBox(tt("Message")) : null}

      {type === "whatsapp_group" ? (
        <>
          {text("url", tt("Group invite link"), { placeholder: "https://chat.whatsapp.com/…", inputMode: "url", max: 300 })}
          {a.url && !whatsappGroupUrl(a.url) ? <p className={PROBLEM}>{tt("Paste the invite link from WhatsApp, starting with chat.whatsapp.com.")}</p> : null}
        </>
      ) : null}

      {type === "telegram" ? (
        <>
          {text("target", tt("Username or link"), { placeholder: tt("@username or t.me/…"), max: 300 })}
          {a.target && !telegramTarget(a.target) ? <p className={PROBLEM}>{tt("Use a username like @storelib, or a t.me link.")}</p> : null}
          {telegramTarget(a.target)?.kind === "username" || !a.target ? messageBox(tt("Message")) : null}
          {preChat}
        </>
      ) : null}

      {type === "email" ? (
        <>
          {text("email", tt("Email address"), { placeholder: "you@example.com", inputMode: "email", max: 254 })}
          {text("subject", tt("Subject"), { max: 300 })}
          {messageBox(tt("Message"))}
        </>
      ) : null}

      {type === "product" ? (
        <>
          <div className={FIELD_STACK}>
            <span className={LABEL}>{tt("Product")}</span>
            <ChoicePicker
              name="action-product"
              title={tt("Product")}
              choices={productChoices}
              value={String(a.product_id || "") || null}
              placeholder={tt("Search products")}
              searchable={productChoices.length > 7}
              onChange={(id) => {
                const p = products?.find((x) => x.id === id) as { id: string; title?: string; slug?: string; thumbnail_url?: string | null } | undefined
                set({ product_id: id, title: p?.title || undefined, slug: p?.slug || undefined, image: p?.thumbnail_url || undefined })
              }}
              fieldLabel={chosenProduct?.title || (products === null ? tt("Loading products") : tt("Choose a product"))}
              fieldMuted={!chosenProduct}
              leading={(c) => {
                const src = productThumb.get(c.value)
                /* eslint-disable-next-line @next/next/no-img-element */
                return src ? <img src={src} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : <ActionMark type="product" />
              }}
            />
          </div>
          <div className={FIELD_STACK}>
            <span className={LABEL}>{tt("Opens")}</span>
            <Segmented
              label={tt("Opens")}
              value={(a.open || "sheet") as "sheet" | "checkout"}
              options={[
                { id: "sheet", label: tt("Product details") },
                { id: "checkout", label: tt("Checkout") },
              ]}
              onChange={(v) => set({ open: v })}
            />
          </div>
        </>
      ) : null}

      {type === "form" ? formSelect(tt("Form or quiz"), "form_id") : null}

      {type === "booking" ? (
        <>
          <Segmented
            label={tt("Booking with")}
            value={bookingMode}
            options={[
              { id: "form", label: tt("Booking form") },
              { id: "url", label: tt("Booking page") },
            ]}
            onChange={(v) => {
              setBookingMode(v)
              onChange((v === "form" ? { type: "booking", form_id: "", ...(a.label ? { label: a.label } : {}) } : { type: "booking", url: "", ...(a.label ? { label: a.label } : {}) }) as NativeAction)
            }}
          />
          {bookingMode === "form" ? formSelect(tt("Booking form"), "form_id", true) : text("url", tt("Booking address"), { placeholder: "https://cal.com/…", inputMode: "url" })}
        </>
      ) : null}

      {showLabel && current ? text("label", tt("Button text"), { max: 80 }) : null}

      {shown ? (
        <p className={cn(HINT, "break-all")} data-action-opens={href}>
          {tt("Opens {address}", { address: shown })}
        </p>
      ) : null}
      {current && !actionHref(current) && !(type === "booking" && !a.form_id && !a.url) ? <p className={HINT}>{tt("Complete the details above to make this button work.")}</p> : null}
      {type === "product" && a.product_id && !UUID.test(a.product_id) ? <p className={PROBLEM}>{tt("Choose the product again.")}</p> : null}
    </div>
  )
}
