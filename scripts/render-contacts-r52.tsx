/**
 * Contacts as a creator sees it (round 52), for scripts/check-contacts-r52.mjs:
 * the real People list (app/(storelib)/app/contacts/people-client.tsx), the
 * real person profile ([key]/profile-client.tsx) and the Forms page's bar,
 * with what the page reads on the server handed over as window.__props.
 * window.__mode picks which; "products" and "orders" draw the neighbours the
 * same way, so they can be compared side by side.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PeopleClient } from "@/app/(storelib)/app/contacts/people-client"
import { ProfileClient } from "@/app/(storelib)/app/contacts/[key]/profile-client"
import { ContactsHeader } from "@/app/(storelib)/app/contacts/contacts-header"
import { FormsList } from "@/app/(storelib)/app/emails/forms/forms-list"
import { ProductsClient } from "@/app/(storelib)/app/products/products-client"
import { OrdersClient } from "@/app/(storelib)/app/orders/orders-client"
import { GUTTER, LIST_WIDTH } from "@/app/(storelib)/app/orders/order-parts"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { LanguageProvider } from "@/lib/i18n"

const w = window as unknown as { __mode: string; __props: Record<string, unknown> }

function Body() {
  const p = w.__props as never as Record<string, never>
  switch (w.__mode) {
    case "profile":
      return <ProfileClient profile={p.profile} marketing />
    case "forms":
      return (
        <>
          <ContactsHeader title="Forms" back />
          <div className={`mx-auto pb-24 pt-3 md:pb-8 ${LIST_WIDTH} ${GUTTER}`} data-contacts-forms="">
            <FormsList />
          </div>
        </>
      )
    case "products":
      return <ProductsClient products={p.products} creatorUsername="astrid" />
    case "orders":
      return <OrdersClient listing={p.listing} listingKey="" products={[]} stripeConnected canRefund hiddenColumns={[]} initialRange={null} timeZone="Europe/Bucharest" now={p.now} />
    default:
      return <PeopleClient query={p.query} page={p.page} communities={p.communities} marketing notice={p.notice ?? null} />
  }
}

document.documentElement.classList.add("app-layout")
createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <LanguageProvider>
      <div style={{ position: "fixed", inset: 0 }}>
        <main className="h-full overflow-hidden bg-[#f8f9fa]">
          <div className="app-content-scroll h-[100svh] overflow-y-auto">
            <Body />
          </div>
        </main>
      </div>
    </LanguageProvider>
  </PlatformSettingsProvider>,
)
