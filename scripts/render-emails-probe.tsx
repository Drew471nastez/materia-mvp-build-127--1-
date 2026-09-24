/**
 * The Emails home screen (app/app/emails/emails-home.tsx) with a creator's
 * worth of subscribers, automations and emails, for
 * scripts/check-emails-page.mjs to measure in Chromium.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EmailsHome, type EmailsTab } from "@/app/app/emails/emails-home"
import { resolveValue, todayIn } from "@/lib/date-range/range"

const today = todayIn("UTC", Date.parse("2026-09-24T12:00:00Z"))
const subscribers = Array.from({ length: 73 }, (_, i) => ({
  id: `s${i}`,
  email: i === 3 ? "a-very-long-address-that-goes-on@studio-with-a-long-domain-name.com" : `person${i}@example.com`,
  name: i % 3 === 0 ? "" : `Person ${i}`,
  source: i % 2 ? "onepage" : "store_builder",
  status: i % 9 === 0 ? "unsubscribed" : "subscribed",
  subscribed_at: new Date(Date.parse("2026-09-01") - i * 86400000).toISOString(),
  unsubscribed_at: i % 13 === 0 ? "2026-08-01T00:00:00Z" : null,
}))
const flows = [
  { id: "f1", name: "Welcome", trigger_type: "new_subscriber", status: "active", steps: [1, 2], stats: { emails_sent: 412, open_rate: 61.2 } },
  { id: "f2", name: "Thank you for buying", trigger_type: "purchase", status: "paused", steps: [1], stats: { emails_sent: 0, open_rate: 0 } },
]
const campaigns = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  subject: i === 1 ? "New presets are out, and the autumn pack is half price until Sunday (Resend)" : `Update number ${i}`,
  sent_at: new Date(Date.parse("2026-09-20") - i * 3 * 86400000).toISOString(),
  scheduled_at: "2026-10-01T09:00:00Z",
  created_at: "2026-09-10T09:00:00Z",
  recipient_count: 300 + i,
  unique_opens: 150 - i,
  unique_clicks: 30,
}))

function App() {
  const [tab, setTab] = React.useState<EmailsTab>((new URLSearchParams(location.search).get("tab") as EmailsTab) || "subscribers")
  const [search, setSearch] = React.useState("")
  const [period, setPeriod] = React.useState(() => resolveValue({ preset: "last_30_days" }, today, "last_30_days"))
  ;(window as unknown as { __log: string[] }).__log = (window as unknown as { __log: string[] }).__log ?? []
  const log = (m: string) => (window as unknown as { __log: string[] }).__log.push(m)
  return (
    <div id="shell" style={{ position: "fixed", inset: 0 }}>
      <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]">
        <EmailsHome
          tab={tab}
          onTab={setTab}
          loading={false}
          onNewEmail={() => log("new")}
          subscribers={subscribers}
          checkoutBuyersCount={4}
          search={search}
          onSearch={setSearch}
          onExportSubscribers={() => log("export")}
          onCopyEmail={(e) => log(`copy ${e}`)}
          onRemoveSubscriber={(id) => log(`remove ${id}`)}
          flows={flows}
          trigger={(t) => ({ name: t, description: t === "purchase" ? "When a customer buys a product" : "When someone joins your list" })}
          onCreateFlow={() => log("create flow")}
          onEditFlow={(f) => log(`edit flow ${f.id}`)}
          onToggleFlow={(f) => log(`toggle ${f.id}`)}
          onDeleteFlow={(id) => log(`delete flow ${id}`)}
          campaigns={tab === "published" || tab === "scheduled" || tab === "drafts" ? campaigns : []}
          onOpenCampaign={(c) => log(`open ${c.id}`)}
          onViewStats={(c) => log(`stats ${c.id}`)}
          onResend={(c) => log(`resend ${c.id}`)}
          onEditCampaign={(c) => log(`edit ${c.id}`)}
          onDeleteCampaign={(id) => log(`delete ${id}`)}
          isSending={false}
          overview={{ total_sent: 3600, total_opened: 1900, total_clicked: 410, total_unsubscribed: 7, open_rate: 52.8, click_rate: 11.4 }}
          usage={{ sent: 2100, limit: 3000 }}
          period={period}
          onPeriod={setPeriod}
          today={today}
        />
      </div>
    </div>
  )
}
createRoot(document.getElementById("app")!).render(<App />)
