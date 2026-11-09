import { displayEmail } from "@/lib/businesses/email-alias"
import { answerText, type Answer } from "./definition"

/* One lead as a CSV row; app/api/leads/export writes each cell through csvCell. */
export const LEAD_CSV_HEADER = ["Submitted", "Form", "Name", "Email", "Phone", "Status", "Score", "Answers", "Marketing opt-in", "Consent", "Source", "Source block", "Source URL", "Booking", "Booking status", "Notes"]


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function leadRow(r: Record<string, any>, booking?: { starts_at: string; status: string } | null): unknown[] {
  const answers = ((r.answers || []) as Answer[]).map((a) => `${a.label}: ${a.type === "file" ? a.file?.name || "File" : answerText(a)}`).join("\n")
  return [
    r.submitted_at,
    r.form_title,
    r.contact_name,
    displayEmail(r.contact_email) ?? "",
    r.contact_phone,
    r.status,
    r.score,
    answers,
    r.consent?.marketing ? "Yes" : "No",
    r.consent?.text || "",
    r.source_kind,
    r.source_block || "",
    r.source_url,
    booking?.starts_at || "",
    booking?.status || "",
    r.notes || "",
  ]
}

