/** Real forms UI, with APIs supplied by the browser audit. */
import React from "react"
import { createRoot } from "react-dom/client"
import { NativeFormSection } from "@/components/website-builder/sections/renderers/NativeFormSection"
import { NativeFormBlock } from "@/components/forms/native-form-block"
import { FormsManager } from "@/components/forms/forms-manager"
import { LeadsManager } from "@/components/forms/leads-manager"
import { PublicFormRenderer } from "@/components/forms/public-form"
import { ActionEditor } from "@/components/forms/action-editor"
import { actionHref, type NativeAction } from "@/lib/forms/actions"
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
const mode = new URLSearchParams(location.search).get("mode")
if (!mode) void import("./render-onepage-avatar-audit")
else
  createRoot(document.getElementById("app")!).render(
    mode === "builder" ? (
      <FormsManager />
    ) : mode === "leads" ? (
      <LeadsManager />
    ) : mode === "action" ? (
      <ActionProbe />
    ) : mode === "website" ? (
      <NativeFormSection
        {...({
          theme: {},
          section: {
            settings: {
              form_url:
                "https://storelib.com/request/forms/11111111-1111-4111-8111-111111111111",
              inline: true,
            },
          },
        } as any)}
      />
    ) : mode === "creator_page" || mode === "onepage" ? (
      <main className="mx-auto max-w-lg p-4">
        <NativeFormBlock
          formId="11111111-1111-4111-8111-111111111111"
          inline
          source={mode}
        />
      </main>
    ) : (
      <main className="mx-auto max-w-lg p-4">
        <PublicFormRenderer formId="11111111-1111-4111-8111-111111111111" />
      </main>
    ),
  )
