/* Every explainer's trigger, for scripts/check-how-it-works.mjs. */
import { createRoot } from "react-dom/client"
import { HowItWorks } from "@/components/app/settings/how-it-works"
import { EXPLAINERS, type ExplainerId } from "@/lib/settings/explainers"

createRoot(document.getElementById("app")!).render(
  <div style={{ padding: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>
    {(Object.keys(EXPLAINERS) as ExplainerId[]).map((id) => (
      <HowItWorks key={id} id={id} />
    ))}
  </div>,
)
