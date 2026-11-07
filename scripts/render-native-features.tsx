/** Real forms UI, with APIs supplied by the browser audit (scripts/check-native-features.mjs). */
import React from "react"
import { createRoot } from "react-dom/client"
import { NativeFormSection } from "@/components/website-builder/sections/renderers/NativeFormSection"
import { NativeFormBlock, type FormPresentation } from "@/components/forms/native-form-block"
import { FormsManager } from "@/components/forms/forms-manager"
import { LeadsManager } from "@/components/forms/leads-manager"
import { PublicFormRenderer } from "@/components/forms/public-form"
import { ActionEditor } from "@/components/forms/action-editor"
import { actionHref, type NativeAction } from "@/lib/forms/actions"
const FORM = "11111111-1111-4111-8111-111111111111"
function ActionProbe() {
  const [value, setValue] = React.useState<NativeAction>()
  return (
    <main className="mx-auto max-w-lg p-4">
      <ActionEditor value={value} onChange={setValue} />
      <a data-action-href="" href={actionHref(value) || "#"}>
        Test action
      </a>
    </main>
  )
}
const params = new URLSearchParams(location.search)
const mode = params.get("mode")
const page = (children: React.ReactNode) => <main className="min-h-svh bg-[#f8f9fa] px-4 py-6"><div className="mx-auto max-w-lg">{children}</div></main>
if (!mode) void import("./render-onepage-avatar-audit")
else
  createRoot(document.getElementById("app")!).render(
    mode === "builder" ? (
      <div className="min-h-svh bg-[#f8f9fa]"><FormsManager /></div>
    ) : mode === "leads" ? (
      <div className="min-h-svh bg-[#f8f9fa]"><LeadsManager /></div>
    ) : mode === "action" ? (
      <ActionProbe />
    ) : mode === "website" ? (
      <NativeFormSection {...({ theme: {}, section: { settings: { form_url: "https://storelib.com/request/forms/" + FORM, inline: true } } } as any)} />
    ) : mode === "creator_page" || mode === "onepage" ? (
      page(<NativeFormBlock formId={FORM} inline source={mode} />)
    ) : mode === "presentation" ? (
      page(<NativeFormBlock formId={FORM} title="Book a call" presentation={(params.get("as") || "card") as FormPresentation} />)
    ) : (
      page(
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <PublicFormRenderer formId={FORM} />
        </div>,
      )
    ),
  )
