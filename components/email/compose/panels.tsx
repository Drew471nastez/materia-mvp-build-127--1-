"use client"

/**
 * The settings of a selected block that is not text: a button's link, colour
 * and place (its words are typed on the button), an image's picture, size
 * and description, a product, a space. They
 * open under the block, in the page's flow, so they never cover the email
 * and never leave the screen on a phone.
 */
import * as React from "react"
import { getProductShareUrl } from "@/lib/url-helpers"
import { IMAGE_WIDTHS, safeUrl, type Align, type ButtonBlock, type ImageBlock, type ProductBlock, type SpacerBlock } from "@/lib/email-campaigns/blocks"
import { cn } from "@/lib/utils"
import { ColorChoice, Field, Segmented, buttonSecondary, inputClass, errorClass } from "./ui"
import { ProductPicker, priceLabel } from "./product-picker"
import { tt } from "@/lib/i18n/text"

const ALIGN: { value: Align; label: string }[] = [
  { value: "left", get label() { return tt("Left") } },
  { value: "center", get label() { return tt("Center") } },
  { value: "right", get label() { return tt("Right") } },
]

const panel = "mt-2 grid gap-4 rounded-xl bg-[#f4f5f7] p-4 sm:grid-cols-2"

function linkError(v: string): string | null {
  if (!v.trim()) return null
  return safeUrl(v) ? null : tt("Use a full web address, like https://example.com")
}

/**
 * A button's settings. Under the block on a wide screen, where its words are
 * typed on the button itself (./block-editor.tsx ButtonView). On a phone
 * (`sheet`, round R8) they are the content of a bottom sheet, the words a
 * field of their own at the top, every control a thumb's size, and the
 * return key on a field puts the keyboard away.
 */
export function ButtonPanel({ block, onChange, brand, sheet = false }: { block: ButtonBlock; onChange: (p: Partial<ButtonBlock>) => void; brand?: string; sheet?: boolean }) {
  const id = block.id
  const urlError = linkError(block.url)
  const done = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sheet && e.key === "Enter") {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }
  return (
    <div className={sheet ? "grid gap-5" : panel} data-block-panel="button">
      {sheet ? (
        <Field label={tt("Button text")} htmlFor={`${id}-label`}>
          <input id={`${id}-label`} className={inputClass} value={block.label} maxLength={60} placeholder={tt("Button text")} enterKeyHint="done" onKeyDown={done} onChange={(e) => onChange({ label: e.target.value })} data-button-label-field="" />
        </Field>
      ) : null}
      <Field label={tt("Link")} htmlFor={`${id}-url`} error={urlError} className="sm:col-span-2">
        <input
          id={`${id}-url`}
          className={inputClass}
          value={block.url}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://"
          aria-invalid={!!urlError}
          enterKeyHint="done"
          onKeyDown={done}
          onChange={(e) => onChange({ url: e.target.value })}
        />
      </Field>
      <Field label={tt("Color")}>
        <ColorChoice value={block.color} brand={brand} onChange={(color) => onChange({ color })} large={sheet} />
      </Field>
      <Field label={tt("Alignment")}>
        <Segmented label={tt("Alignment")} value={block.align} options={ALIGN} onChange={(align) => onChange({ align })} className={sheet ? "h-11 w-full sm:h-11 [&>button]:flex-1 [&>button]:text-[15px]" : undefined} />
      </Field>
    </div>
  )
}

export function ImagePanel({
  block,
  onChange,
  onUpload,
  uploading,
  uploadError,
}: {
  block: ImageBlock
  onChange: (p: Partial<ImageBlock>) => void
  onUpload: () => void
  uploading: boolean
  uploadError: string | null
}) {
  const id = block.id
  const [link, setLink] = React.useState("")
  if (!block.src) {
    return (
      <div className={panel} data-block-panel="image">
        <Field label={tt("Picture")} hint={tt("JPG, PNG, GIF or WebP, up to 5 MB.")} error={uploadError}>
          <button type="button" className={cn(buttonSecondary, "h-11 w-full sm:h-9")} onClick={onUpload} disabled={uploading}>
            {uploading ? tt("Uploading…") : tt("Upload an image")}
          </button>
        </Field>
        <Field label={tt("Or an image address")} htmlFor={`${id}-src`} error={link && !safeUrl(link) ? tt("Use a full address, like https://example.com/photo.jpg") : null}>
          <div className="flex gap-2">
            <input id={`${id}-src`} className={inputClass} value={link} inputMode="url" autoCapitalize="off" placeholder="https://" onChange={(e) => setLink(e.target.value)} />
            <button type="button" className={cn(buttonSecondary, "h-11 shrink-0 sm:h-9")} disabled={!safeUrl(link)} onClick={() => onChange({ src: safeUrl(link) })}>
              {tt("Use")}
            </button>
          </div>
        </Field>
      </div>
    )
  }
  const urlError = linkError(block.href)
  return (
    <div className={panel} data-block-panel="image">
      <Field label={tt("Description")} htmlFor={`${id}-alt`} hint={tt("Read out to people who cannot see it, and shown while pictures are off.")}>
        <input id={`${id}-alt`} className={inputClass} value={block.alt} maxLength={160} placeholder={tt("What the picture shows")} onChange={(e) => onChange({ alt: e.target.value })} />
      </Field>
      <Field label={tt("Link")} htmlFor={`${id}-href`} error={urlError} hint={tt("Optional. Where a tap on the picture goes.")}>
        <input id={`${id}-href`} className={inputClass} value={block.href} inputMode="url" autoCapitalize="off" placeholder="https://" aria-invalid={!!urlError} onChange={(e) => onChange({ href: e.target.value })} />
      </Field>
      <Field label={tt("Width")}>
        <Segmented
          label={tt("Width")}
          value={block.width}
          options={IMAGE_WIDTHS.map((w) => ({ value: w, label: w === 100 ? tt("Full") : `${w}%` }))}
          onChange={(width) => onChange({ width })}
        />
      </Field>
      <Field label={tt("Alignment")}>
        <Segmented label={tt("Alignment")} value={block.align} options={ALIGN} onChange={(align) => onChange({ align })} />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="button" className={buttonSecondary} onClick={onUpload} disabled={uploading}>
          {uploading ? tt("Uploading…") : tt("Replace image")}
        </button>
        {uploadError ? <span className={errorClass}>{uploadError}</span> : null}
      </div>
    </div>
  )
}

export function ProductPanel({
  block,
  onChange,
  creatorId,
  username,
  pickerOpen,
  onPickerOpen,
  brand,
}: {
  block: ProductBlock
  onChange: (p: Partial<ProductBlock>) => void
  creatorId: string | null
  username: string | null
  pickerOpen: boolean
  onPickerOpen: (o: boolean) => void
  brand?: string
}) {
  return (
    <div className={panel} data-block-panel="product">
      <Field label={tt("Product")}>
        <ProductPicker
          creatorId={creatorId}
          open={pickerOpen}
          onOpenChange={onPickerOpen}
          onPick={(p) =>
            onChange({
              productId: p.id,
              title: p.title,
              price: priceLabel(p.price_cents),
              imageUrl: p.thumbnail_url && /^https:\/\//.test(p.thumbnail_url) ? p.thumbnail_url : "",
              url: getProductShareUrl(username || "", p.slug),
            })
          }
          trigger={
            <button type="button" className={cn(buttonSecondary, "h-11 w-full justify-between sm:h-9")}>
              <span className="truncate">{block.title || tt("Choose a product")}</span>
              <span className="text-[#6b7280]">{block.productId ? tt("Change") : ""}</span>
            </button>
          }
        />
      </Field>
      <Field label={tt("Button text")} htmlFor={`${block.id}-cta`}>
        <input id={`${block.id}-cta`} className={inputClass} value={block.cta} maxLength={40} onChange={(e) => onChange({ cta: e.target.value })} />
      </Field>
      <Field label={tt("Button color")} className="sm:col-span-2">
        <ColorChoice value={block.color} brand={brand} onChange={(color) => onChange({ color })} />
      </Field>
    </div>
  )
}

export function SpacerPanel({ block, onChange }: { block: SpacerBlock; onChange: (p: Partial<SpacerBlock>) => void }) {
  return (
    <div className={panel} data-block-panel="spacer">
      <Field label={tt("Height")}>
        <Segmented
          label={tt("Height")}
          value={block.size}
          options={[
            { value: 16, label: tt("Small") },
            { value: 32, label: tt("Medium") },
            { value: 48, label: tt("Large") },
          ]}
          onChange={(size) => onChange({ size })}
        />
      </Field>
    </div>
  )
}
