"use client"
import { useEffect, useState } from "react"
import { actionHref, type NativeAction } from "@/lib/forms/actions"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
const input =
  "w-full rounded-lg border border-[#e3e4e8] bg-white px-3 py-2 text-sm text-[#1a1a2e]"
const empty = (type: string): NativeAction =>
  type === "whatsapp"
    ? { type, phone: "", message: "" }
    : type === "email"
      ? { type, email: "", subject: "", message: "" }
      : type === "phone"
        ? { type, phone: "" }
        : type === "product"
          ? { type, product_id: "" }
          : type === "form"
            ? { type, form_id: "" }
            : type === "appointment"
              ? { type, url: "" }
              : { type: "url", url: "" }
/** Shared by OnePage cards, form completion and other page builders. */
export function ActionEditor({
  value,
  onChange,
  allowNone = false,
}: {
  value?: NativeAction
  onChange: (action: NativeAction | undefined) => void
  allowNone?: boolean
}) {
  const type = value?.type || "",
    products = useCreatorProducts(type === "product")
  const [forms, setForms] = useState<
      { id: string; title: string; status: string }[]
    >([]),
    [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (type !== "form") return
    let live = true
    fetch("/api/forms", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error || "Forms could not be loaded.")
        if (live) setForms(b.forms || [])
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [type])
  const change = (patch: Record<string, string>) =>
    onChange({ ...value, ...patch } as NativeAction)
  const field = (key: string, label: string, multiline = false) => {
    const v = String((value as unknown as Record<string, string>)?.[key] ?? "")
    return (
      <label className="block space-y-1 text-xs font-medium text-[#4b5563]">
        {label}
        {multiline ? (
          <textarea
            className={input}
            rows={3}
            maxLength={4000}
            value={v}
            onChange={(e) => change({ [key]: e.target.value })}
          />
        ) : (
          <input
            className={input}
            value={v}
            inputMode={
              key === "phone" ? "tel" : key === "email" ? "email" : undefined
            }
            onChange={(e) => change({ [key]: e.target.value })}
          />
        )}
      </label>
    )
  }
  return (
    <div className="space-y-3" data-native-action-editor="">
      <label className="block space-y-1 text-xs font-medium text-[#4b5563]">
        Action
        <select
          aria-label="Action type"
          className={input}
          value={type}
          onChange={(e) =>
            onChange(e.target.value ? empty(e.target.value) : undefined)
          }
        >
          {allowNone ? (
            <option value="">Success message only</option>
          ) : (
            <option value="">Existing link</option>
          )}
          {[
            ["url", "Web address"],
            ["whatsapp", "WhatsApp message"],
            ["email", "Email"],
            ["phone", "Phone call"],
            ["product", "Storelib product"],
            ["form", "Form or quiz"],
            ["appointment", "Appointment"],
          ].map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {type === "url" || type === "appointment"
        ? field(
            "url",
            type === "appointment" ? "Booking address" : "Web address",
          )
        : null}
      {type === "whatsapp" || type === "phone"
        ? field("phone", "International phone number")
        : null}
      {type === "whatsapp" ? field("message", "Prefilled message", true) : null}
      {type === "email" ? (
        <>
          {field("email", "Email address")}
          {field("subject", "Subject")}
          {field("message", "Message", true)}
        </>
      ) : null}
      {type === "product" ? (
        <label className="block space-y-1 text-xs font-medium text-[#4b5563]">
          Product
          <select
            className={input}
            value={(value as { product_id?: string })?.product_id || ""}
            onChange={(e) => change({ product_id: e.target.value })}
          >
            <option value="">Choose a product</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {type === "form" ? (
        <>
          <label className="block space-y-1 text-xs font-medium text-[#4b5563]">
            Form or quiz
            <select
              className={input}
              value={(value as { form_id?: string })?.form_id || ""}
              onChange={(e) => change({ form_id: e.target.value })}
            >
              <option value="">Choose a form</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title || "Unnamed form"}
                  {f.status !== "published" ? " (draft)" : ""}
                </option>
              ))}
            </select>
          </label>
          <a
            href="/app/audience/forms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium underline"
          >
            Create or edit forms
          </a>
          {error ? (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
      {value && !actionHref(value) ? (
        <p className="text-xs text-[#6b7280]">
          Complete the action details to make this button work.
        </p>
      ) : null}
      {type === "whatsapp" ? (
        <p className="text-xs text-[#6b7280]">
          Include the country code, for example +40. The WhatsApp link is
          generated for you.
        </p>
      ) : null}
    </div>
  )
}
