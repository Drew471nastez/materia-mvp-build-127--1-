import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { COMMERCE_DOCS, type FactKey } from "@/lib/admin/commerce-docs"
import { factsFor } from "@/lib/admin/commerce-docs-facts"
import { PHYSICAL_ARTICLES } from "@/lib/help/physical-articles"

import { AdminLogin } from "../_console/login"
import { CommerceDocsAdmin } from "./commerce-docs-admin"

/**
 * `storelib.com/admin/physical-commerce`: how physical and digital commerce
 * work in Storelib, for the owner. Every setting and feature, what it does,
 * where buyers and creators meet it and how to check it works
 * (lib/admin/commerce-docs.ts), the lists that live in the code printed from
 * the code (lib/admin/commerce-docs-facts.ts), and a live status read from
 * real data (lib/admin/commerce-status.ts, through
 * /api/admin/commerce-status). The admin cookie is checked here, on the
 * server, before anything is read, and again by the status route. Never
 * indexed.
 */
export const metadata: Metadata = {
  title: "Physical commerce | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminPhysicalCommercePage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  const keys = [...new Set(COMMERCE_DOCS.flatMap((s) => s.facts ?? []))] as FactKey[]
  const help = PHYSICAL_ARTICLES.map((a) => ({ slug: a.slug, title: a.title }))
  return <CommerceDocsAdmin docs={COMMERCE_DOCS} facts={factsFor(keys)} help={help} />
}
