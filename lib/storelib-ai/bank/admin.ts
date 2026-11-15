/**
 * What /admin/ai-bank shows of a bank row: everything but the snapshot. Pure, browser safe.
 */
import type { BankFeature, BankProfile, SectionRole } from "./snapshot"

export interface BankRowView {
  id: string
  installId: string
  templateId: string
  name: string
  kind: BankProfile["kind"]
  enabled: boolean
  /** The admin's tags when set, else what the site's words suggested. */
  industries: string[]
  /** The admin's own tags only. */
  tags: { industries: string[]; keywords: string[] }
  features: BankFeature[]
  counts: BankProfile["counts"]
  /** Home's sections by role, in order (header and footer included). */
  home: SectionRole[]
  snapshotAt: string
}

export function bankRowView(row: { id: string; install_id: string; template_id: string; name: string; kind: BankProfile["kind"]; enabled: boolean; industries: string[] | null; keywords: string[] | null; profile: BankProfile; snapshot_at: string }): BankRowView {
  const p = row.profile
  const industries = row.industries?.length ? row.industries : p?.industries ?? []
  return {
    id: row.id,
    installId: row.install_id,
    templateId: row.template_id,
    name: row.name,
    kind: row.kind,
    enabled: row.enabled,
    industries,
    tags: { industries: row.industries ?? [], keywords: row.keywords ?? [] },
    features: p?.features ?? [],
    counts: p?.counts ?? { pages: 0, sections: 0, files: 0, imageSlots: 0, bindings: 0, removed: 0 },
    home: (p?.sections ?? []).filter((s) => s.page === "home").map((s) => s.role),
    snapshotAt: row.snapshot_at,
  }
}
