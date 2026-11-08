"use client"

/**
 * ===========================================================================
 *  CONTACTS' BAR: THE TITLE, THE PAGE'S ACTIONS AND PEOPLE | FORMS
 * ===========================================================================
 * The same flat bar Emails draws (app/app/emails/emails-home.tsx): the title
 * and the page's actions on one line, the views under it as Analytics' pill
 * track (SegmentedPills). People and Forms are two addresses
 * (/app/contacts, /app/contacts/forms), so a reload or a shared link opens
 * the same one and the browser's back walks between them.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { SegmentedPills } from "@/components/app/segmented-pills"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { PaneBar, LIST_WIDTH } from "../orders/order-parts"
import { tt } from "@/lib/i18n/text"

export type ContactsTab = "people" | "forms"

const HREF: Record<ContactsTab, string> = { people: "/app/contacts", forms: "/app/contacts/forms" }

export function ContactsHeader({ tab, actions }: { tab: ContactsTab; actions?: React.ReactNode }) {
  const router = useRouter()
  return (
    <PaneBar width={LIST_WIDTH} className="pb-1 pt-2">
      <div className="flex min-h-[48px] items-center justify-between gap-2">
        <h1 className="shrink-0 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Contacts")}</h1>
        <div className="flex min-w-0 items-center gap-2">{actions}</div>
      </div>
      <div className="flex h-11 items-center" data-contacts-tabs="">
        <SegmentedPills
          label={tt("Views")}
          value={tab}
          onChange={(next) => router.push(HREF[next])}
          onIntent={(next) => prefetchAppPage(router, HREF[next])}
          options={[
            { value: "people", label: tt("People") },
            { value: "forms", label: tt("Forms") },
          ]}
        />
      </div>
    </PaneBar>
  )
}
