import React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { IntegrationCard } from "@/components/physical/integrations-marketplace"
import { PROVIDERS } from "@/lib/physical/providers"
import { Mark } from "@/components/app/settings/integration-mark"

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <div style={{ width: 1100, padding: 24 }}>
      <IntegrationsDirectory />
      <ul data-provider-cards="">
        {PROVIDERS.map((p) => <IntegrationCard key={p.id} provider={p} state={null} loading={false} onSaved={() => {}} />)}
      </ul>
      <div data-broken=""><Mark item={{ id: "x", name: "Broken Co", logo: "/integrations/does-not-exist.svg" }} /></div>
    </div>
  </PlatformSettingsProvider>,
)
