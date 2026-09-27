/**
 * The shared rich text field and the description renderer, mounted for
 * scripts/check-rich-text.mjs to measure.
 *
 *   ?view=editor       the field as the product editor's Content card holds it
 *   ?view=email        the Emails automation body, with its two extra tools
 *   ?view=render       a description the old editor saved, drawn for a visitor
 *   ?view=hydrate      both, rendered to a string first and then hydrated,
 *                      the way the server and the browser meet
 *   ?view=bar          the email composer's one formatting bar over two
 *                      text blocks, at the width `&w=` (default the window)
 *   ?view=builder      the website builder's field, in a sidebar `&w=` wide
 *
 * `&value=` sets the starting value; `&resizable=1` gives the field its
 * resize bar, as the product editor does. Every value the field hands up is kept
 * in window.__values, the last one in window.__value.
 *
 * The product description's picture upload is stubbed: it waits
 * `&uploadMs=` (default 600), then answers with an address in this
 * project's storage, or with `&upload=fail` refuses the way a dropped
 * connection does. scripts/check-rich-text.mjs serves that address.
 */
import React from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { descriptionTooLong } from "@/lib/rich-text/policy"
import { RichDescriptionContent } from "@/components/store-builder/description-rich-editor"
import { BodyEditor } from "@/app/app/emails/flow/body-editor"
import { FormatBar, usePhoneLayout } from "@/components/email/compose/format-bar"
import { EmailText } from "@/components/email/compose/text-block"
import { RichTextField } from "@/components/website-builder/rich-text-field"

type W = Window & { __value: string; __values: string[]; __errors: string[]; __ready: boolean }
const w = window as unknown as W
w.__values = []
w.__errors = []
w.__value = ""

const params = new URLSearchParams(location.search)
const view = params.get("view") ?? "editor"
const initial = params.get("value") ?? ""
export const STORED_PICTURE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/creator-1/product-1/1_description_probe.webp"

async function stubUpload(file: File): Promise<{ url: string; width: number; height: number }> {
  await new Promise((r) => setTimeout(r, Number(params.get("uploadMs") ?? 600)))
  if (params.get("upload") === "fail") throw new Error("The picture did not upload. Check the connection and try again.")
  const bitmap = await createImageBitmap(file)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return { url: STORED_PICTURE, ...size }
}

export const LEGACY = [
  `<h1>Header</h1><p>Plain <b>bold</b> and <a href="https://example.com" style="color: #7c3aed; text-decoration: underline;">a link</a>.</p>`,
  `<div data-embed-id="embed-1" data-embed-type="youtube" contenteditable="false" class="embed-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: visible; margin: 12px 0; border-radius: 8px; user-select: none;" onmouseenter="window.__ran = (window.__ran || 0) + 1"><button data-delete-embed="true" style="position: absolute; top: 8px; right: 8px; opacity: 0;" onmouseenter="window.__ran = 1"><svg width="14" height="14" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line></svg></button><iframe src="https://www.youtube.com/embed/xyz" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allowfullscreen loading="lazy"></iframe></div><p><br></p>`,
  `<div style="text-align: center; margin: 8px 0;"><a href="https://example.com/buy" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 24px; font-weight: 500; text-decoration: none; background-color: #16a34a; color: #ffffff; border-radius: 8px;">Buy now</a></div>`,
  `<ul><li>One</li><li>Two</li></ul><img src="x" onerror="window.__ran = 1"><script>window.__ran = 1</script>`,
].join("")

function Field({ start }: { start: string }) {
  const [value, setValue] = React.useState(start)
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6" data-card>
          <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Content</h2>
          <p className="mb-4 text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">Describe your product to attract customers.</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <RichTextEditor
              value={value}
              onChange={(html) => {
                w.__value = html
                w.__values.push(html)
                setValue(html)
              }}
              label="Description"
              placeholder="What it is, who it is for, and what they get"
              uploadImage={stubUpload}
              checkSize={descriptionTooLong}
              resizable={params.get("resizable") === "1"}
            />
          </div>
          <button type="button" data-reset onClick={() => setValue("<p>Reset from outside</p>")} className="mt-3 text-[13px] text-[#6b7280]">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

function Email({ start }: { start: string }) {
  const [value, setValue] = React.useState(start)
  return (
    <div className="mx-auto max-w-[520px] p-4">
      <BodyEditor
        label="Email body"
        value={value}
        onChange={(html) => {
          w.__value = html
          w.__values.push(html)
          setValue(html)
        }}
      />
    </div>
  )
}

/** The composer's bar and two blocks, as block-editor.tsx lays them out. */
function Bar() {
  const phone = usePhoneLayout()
  const ref = React.useRef<HTMLDivElement>(null)
  const [a, setA] = React.useState(initial || "<p>Hello from the studio</p>")
  const [b, setB] = React.useState("<p>Second block</p>")
  const width = params.get("w")
  return (
    <div className="min-h-screen bg-[#f8f9fa] py-4">
      <div ref={ref} data-email-editor="" className="mx-auto rounded-2xl border border-[#e5e7eb]/60 bg-white" style={{ maxWidth: width ? Number(width) : undefined }}>
        <FormatBar
          editorRef={ref}
          phone={phone}
          inserts={[{ type: "button", label: "Button" }, { type: "image", label: "Image" }]}
          onInsert={() => {}}
          blockActions={() => [{ label: "Move up", run: () => {} }, { label: "Delete", run: () => {}, danger: true }]}
          fields={[{ label: "First name", field: "first_name" }]}
        />
        <div data-compose="" className="space-y-3 px-5 pb-4 pt-6">
          <div data-block-id="a">
            <EmailText id="a" html={a} label="Text" placeholder="Write something" onChange={(h) => { setA(h); w.__value = h; w.__values.push(h) }} />
          </div>
          <div data-block-id="b">
            <EmailText id="b" html={b} label="Text" placeholder="Write something" onChange={setB} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The website builder's field, in a sidebar as narrow as the builder's. */
function Builder() {
  const [value, setValue] = React.useState(initial || "<p>About the shop</p>")
  return (
    <div className="bg-white p-3" style={{ width: Number(params.get("w") ?? 300) }}>
      <RichTextField value={value} onChange={(h) => { setValue(h); w.__value = h }} placeholder="Text" />
    </div>
  )
}

function Rendered({ html }: { html: string }) {
  return (
    <div className="mx-auto max-w-[640px] p-4 text-[14px] text-[#374151]" data-rendered>
      <RichDescriptionContent html={html} className="text-sm" />
    </div>
  )
}

const app = document.getElementById("app") as HTMLElement

if (view === "hydrate") {
  /* The server's string, then the browser's hydration of it. A mismatch is a
     recoverable error, which React reports rather than throws. */
  const tree = (
    <>
      <Field start={initial || LEGACY} />
      <Rendered html={LEGACY} />
      <Rendered html={"Plain text &amp; old\nsecond line"} />
    </>
  )
  app.innerHTML = renderToString(tree)
  hydrateRoot(app, tree, {
    onRecoverableError: (err) => w.__errors.push(`recoverable: ${String((err as Error)?.message ?? err)}`),
  })
} else {
  const root = createRoot(app)
  if (view === "email") root.render(<Email start={initial} />)
  else if (view === "bar") root.render(<Bar />)
  else if (view === "builder") root.render(<Builder />)
  else if (view === "render") root.render(<Rendered html={initial || LEGACY} />)
  else root.render(<Field start={initial} />)
}
w.__ready = true
