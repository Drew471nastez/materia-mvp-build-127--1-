"use client"

/**
 * THE PRODUCT SECTION'S PERSONALIZATION BLOCK (themes/default/sections/
 * product.json, type `personalization`): a text field, a picture upload or
 * both, each with the block's own label. What the buyer gives becomes the
 * cart line's properties (lib/website-builder/personalization), so it
 * reaches the checkout, the order, the emails and the store's order page.
 *
 * A picture goes to POST /api/cart/uploads on this website's own host the
 * moment it is chosen (lib/cart-uploads: checked, drawn again without its
 * metadata, kept privately for this browser and this store), and the line
 * keeps only the answer's value. The small copy shown is that value, which
 * only this browser can open. In the builder, or for a download, the field
 * is drawn but sends nothing.
 */
import { useRef, useState } from "react"

import { CART_UPLOAD_ACCEPT, CART_UPLOAD_MAX_BYTES, UPLOAD_ERRORS, readUploadValue } from "@/lib/cart-uploads/rules"
import { imageKey, personalizationFields, textKey } from "@/lib/website-builder/personalization"
import type { ProductCtx } from "./product-blocks"

type S = Record<string, unknown>

export function PersonalizationBlock({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const [field] = personalizationFields([
    { id: String(s.__id ?? "p"), type: "personalization", settings: { kind: s.kind, label: s.label, placeholder: s.placeholder, max_length: s.max_length, upload_label: s.upload_label, required: s.required } },
  ])
  const p = ctx.personalization
  const ink = ctx.palette.heading
  const muted = ctx.palette.text_muted ?? ctx.palette.paragraph
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  if (!field) return null
  /* A download has no order line to keep the words on: nothing on the live page, one quiet line in the builder. */
  if (ctx.product.type !== "physical" && !ctx.sample) {
    return ctx.inEditor ? <p className="text-[12px] italic leading-5" style={{ color: muted, opacity: 0.55 }} data-editor-note="">Only a product that ships takes personalization</p> : null
  }
  /* The block's own id is what its values are kept under: ProductBlock hands the settings, the section knows the id. */
  const id = field.id
  const text = p?.values[textKey({ id })] ?? ""
  const image = p?.values[imageKey({ id })] ?? ""
  const upload = readUploadValue(image)
  const missing = p?.missing ?? null
  const textMissing = !!missing && field.required && field.kind !== "image" && !text.trim()
  const imageMissing = !!missing && field.required && field.kind !== "text" && !upload
  const inputStyle = { borderRadius: `var(--theme-input-radius, ${ctx.radius})`, color: ink }

  const send = async (file: File) => {
    setProblem(null)
    if (file.size > CART_UPLOAD_MAX_BYTES) return setProblem(UPLOAD_ERRORS.too_large)
    if (!p?.uploadsOn) return setProblem(UPLOAD_ERRORS.wrong_place)
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file, file.name)
      const r = await fetch("/api/cart/uploads", { method: "POST", body: form, credentials: "same-origin" })
      const d = (await r.json().catch(() => null)) as { upload?: { value?: string }; message?: string } | null
      const value = d?.upload?.value
      if (!r.ok || !value || !readUploadValue(value)) setProblem(d?.message || UPLOAD_ERRORS.failed)
      else p.set(imageKey({ id }), value)
    } catch {
      setProblem(UPLOAD_ERRORS.failed)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3" data-personalization="">
      {field.kind !== "image" ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`pz-${id}`} className="text-[14px] font-medium" style={{ color: ink }}>
              {field.label}
              {field.required ? <span aria-hidden> *</span> : null}
            </label>
            {text.length > field.maxLength * 0.8 ? <span className="text-[12px] tabular-nums" style={{ color: muted }}>{text.length}/{field.maxLength}</span> : null}
          </div>
          <input
            id={`pz-${id}`}
            type="text"
            autoComplete="off"
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={text}
            required={field.required}
            disabled={ctx.inert}
            aria-invalid={textMissing || undefined}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => p?.set(textKey({ id }), e.target.value.slice(0, field.maxLength))}
            className="h-12 w-full border bg-transparent px-3.5 text-[16px] outline-none"
            style={{ ...inputStyle, borderColor: textMissing ? "#dc2626" : ctx.palette.border }}
          />
          {textMissing ? <p className="text-[13px] text-[#dc2626]">{`Enter ${field.label}`}</p> : null}
        </div>
      ) : null}
      {field.kind !== "text" ? (
        <div className="space-y-1.5">
          <p className="text-[14px] font-medium" style={{ color: ink }}>
            {field.uploadLabel}
            {field.required ? <span aria-hidden> *</span> : null}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={CART_UPLOAD_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void send(f)
            }}
          />
          {upload ? (
            <div className="flex items-center gap-3 border px-2.5 py-2" style={{ ...inputStyle, borderColor: ctx.palette.border }} data-personalization-upload="">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-cover" style={{ borderRadius: 6 }} referrerPolicy="no-referrer" />
              <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: ink }}>{upload.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); p?.set(imageKey({ id }), "") }}
                className="shrink-0 text-[13px] underline underline-offset-4"
                style={{ color: muted }}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || ctx.inert}
              onClick={(e) => { e.stopPropagation(); if (!ctx.inEditor) fileRef.current?.click() }}
              className="flex h-12 w-full items-center justify-center border border-dashed px-3.5 text-[14px] font-medium disabled:opacity-60"
              style={{ ...inputStyle, borderColor: imageMissing ? "#dc2626" : ctx.palette.border }}
              aria-invalid={imageMissing || undefined}
            >
              {busy ? "Uploading..." : "Choose a picture"}
            </button>
          )}
          {problem || imageMissing ? <p className="text-[13px] text-[#dc2626]">{problem ?? `Add ${field.uploadLabel.charAt(0).toLowerCase()}${field.uploadLabel.slice(1)}`}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
