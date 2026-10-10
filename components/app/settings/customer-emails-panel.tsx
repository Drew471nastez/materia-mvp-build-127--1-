"use client"

/**
 * SETTINGS › CUSTOMER EMAILS: every email a buyer gets from the store
 * (lib/emails/customer-catalog.ts), grouped like Shopify's Customer
 * notifications, each with when it goes and a preview drawn by the template
 * that sends it (/api/store/emails/preview), in a sandboxed frame. The ones
 * about shipping, pickup and returns show while physical commerce is on.
 *
 * They go from Storelib's sending address with the store's name on them,
 * and a reply goes to the store's contact email (Settings › Store details).
 */
import * as React from "react"
import { ChevronRight, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { Card, Modal, Notice, api } from "@/components/physical/ui"
import { GROUP_NAMES, visibleCustomerEmails, type CustomerEmail, type CustomerEmailGroup } from "@/lib/emails/customer-catalog"

const GROUP_ORDER: CustomerEmailGroup[] = ["orders", "shipping", "pickup", "returns"]

export function CustomerEmailsPanel() {
  const physical = usePhysicalCommerceEnabled()
  const emails = visibleCustomerEmails(physical)
  const [open, setOpen] = React.useState<CustomerEmail | null>(null)

  return (
    <div className="space-y-4 sm:space-y-6" data-customer-emails="">
      <Card title="Customer emails" description="What your buyers get from you, and when. Each goes out with your store's name, and a reply comes to your contact email.">
        <div className="space-y-5">
          {GROUP_ORDER.map((g) => {
            const list = emails.filter((e) => e.group === g)
            if (list.length === 0) return null
            return (
              <section key={g} aria-labelledby={`emails-${g}`}>
                <h3 id={`emails-${g}`} className="mb-2 text-[13px] font-semibold text-[#6b7280]">
                  {GROUP_NAMES[g]}
                </h3>
                <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setOpen(e)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa]" data-customer-email={e.id}>
                        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                          <Mail className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-[#1a1a2e]">{e.name}</span>
                          <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{e.sentWhen}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </Card>
      <Preview email={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Preview({ email, onClose }: { email: CustomerEmail | null; onClose: () => void }) {
  const [mail, setMail] = React.useState<{ subject: string; html: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [height, setHeight] = React.useState(520)

  React.useEffect(() => {
    if (!email) return
    setMail(null)
    setError(null)
    void api<{ subject: string; html: string }>(`/api/store/emails/preview?id=${encodeURIComponent(email.id)}`).then((r) => (r.ok ? setMail(r.data) : setError(r.error)))
  }, [email])

  return (
    <Modal open={!!email} onClose={onClose} title={email?.name ?? "Preview"} wide>
      <div className="space-y-3" data-email-preview={email?.id}>
        {mail ? (
          <p className="text-[13px] text-[#6b7280]">
            <span className="font-medium text-[#374151]">Subject:</span> {mail.subject}
          </p>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        <div className={cn("overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]", !mail && "min-h-[520px]")}>
          {mail ? (
            <iframe
              title={`${email?.name ?? "Email"} preview`}
              srcDoc={mail.html}
              sandbox="allow-same-origin"
              className="block w-full"
              style={{ height }}
              onLoad={(e) => {
                try {
                  const doc = (e.currentTarget as HTMLIFrameElement).contentDocument
                  if (doc?.body) setHeight(Math.min(1400, Math.max(400, doc.documentElement.scrollHeight)))
                } catch {
                  /* A sandboxed frame without same-origin can't be measured: it keeps its height and scrolls. */
                }
              }}
            />
          ) : null}
        </div>
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">A sample order with your store&apos;s name. The real email carries the buyer&apos;s own items, address and order.</p>
      </div>
    </Modal>
  )
}
