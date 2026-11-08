/**
 * Browser entry for scripts/check-onepage-actions.mjs: the real action
 * editor (?mode=editor, with ?legacy=<address> for a link saved before
 * actions), or the real public page (?live), whose blocks the check hands
 * over through /audit-state.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ActionEditor } from "@/components/forms/action-editor"
import { FormPicker } from "@/components/forms/form-picker"
import { actionFromUrl, actionHref, type NativeAction } from "@/lib/forms/actions"

function EditorProbe() {
  const legacy = new URLSearchParams(location.search).get("legacy") || ""
  const [value, setValue] = React.useState<NativeAction>()
  ;(window as any).__action = value
  const href = actionHref(value ?? actionFromUrl(legacy))
  return (
    <main className="mx-auto max-w-[420px] p-4">
      <ActionEditor value={value} url={legacy || undefined} showLabel onChange={setValue} />
      <output data-probe-href={href || ""} />
    </main>
  )
}

/* Round AN (scripts/check-forms-builder.mjs): the form picker as a block's settings draw it, with Edit questions opening the builder dialog. */
function BuilderProbe() {
  const [id, setId] = React.useState(new URLSearchParams(location.search).get("form") || "")
  return (
    <main className="mx-auto max-w-[420px] p-4">
      <FormPicker kind="prechat" label="Questions" value={id} allowEmpty={false} onChange={setId} />
    </main>
  )
}

const mode = new URLSearchParams(location.search).get("mode")
if (mode === "editor") createRoot(document.getElementById("app")!).render(<EditorProbe />)
else if (mode === "builder") createRoot(document.getElementById("app")!).render(<BuilderProbe />)
else void import("./render-onepage-avatar-audit")
