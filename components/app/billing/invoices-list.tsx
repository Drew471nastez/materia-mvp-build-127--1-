"use client"

import { Download, FileText, CheckCircle, Clock, XCircle } from "lucide-react"

interface Invoice {
  id: string
  stripe_invoice_id: string
  amount_cents: number
  status: string
  invoice_pdf_url: string | null
  hosted_invoice_url: string | null
  created_at: string
  period_start: string | null
  period_end: string | null
}

interface InvoicesListProps {
  invoices: Invoice[]
}

export function InvoicesList({ invoices }: InvoicesListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatAmount = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            <CheckCircle className="h-3 w-3" />
            Paid
          </div>
        )
      case "open":
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            <Clock className="h-3 w-3" />
            Pending
          </div>
        )
      case "void":
      case "uncollectible":
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
            <XCircle className="h-3 w-3" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </div>
        )
      default:
        return (
          <div className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </div>
        )
    }
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
        <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Billing History</h3>
        <div className="bg-[#f9fafb] rounded-xl p-8 text-center">
          <FileText className="h-10 w-10 text-[#9ca3af] mx-auto mb-3" />
          <p className="text-[13px] text-[#6b7280] mb-1">No invoices yet</p>
          <p className="text-[12px] text-[#9ca3af]">
            Your billing history will appear here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
      <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Billing History</h3>

      {/* Mobile view */}
      <div className="block sm:hidden space-y-3">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="bg-[#f9fafb] rounded-xl p-4 border border-[#e5e7eb]"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[14px] font-semibold text-[#1a1a2e] mb-1">
                  {formatAmount(invoice.amount_cents)}
                </div>
                <div className="text-[12px] text-[#6b7280]">
                  {formatDate(invoice.created_at)}
                </div>
              </div>
              {getStatusBadge(invoice.status)}
            </div>

            {invoice.period_start && invoice.period_end && (
              <div className="text-[11px] text-[#9ca3af] mb-3">
                Billing period: {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
              </div>
            )}

            <div className="flex gap-2">
              {invoice.invoice_pdf_url && (
                <a
                  href={invoice.invoice_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-9 text-[12px] font-medium bg-white hover:bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </a>
              )}
              {invoice.hosted_invoice_url && (
                <a
                  href={invoice.hosted_invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-9 text-[12px] font-medium bg-white hover:bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Invoice
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb]">
              <th className="text-left text-[12px] font-semibold text-[#6b7280] pb-3">Date</th>
              <th className="text-left text-[12px] font-semibold text-[#6b7280] pb-3">Amount</th>
              <th className="text-left text-[12px] font-semibold text-[#6b7280] pb-3">Period</th>
              <th className="text-left text-[12px] font-semibold text-[#6b7280] pb-3">Status</th>
              <th className="text-right text-[12px] font-semibold text-[#6b7280] pb-3">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#fafafa] transition-colors"
              >
                <td className="py-4 text-[13px] text-[#374151]">
                  {formatDate(invoice.created_at)}
                </td>
                <td className="py-4 text-[13px] font-medium text-[#1a1a2e]">
                  {formatAmount(invoice.amount_cents)}
                </td>
                <td className="py-4 text-[12px] text-[#6b7280]">
                  {invoice.period_start && invoice.period_end ? (
                    <>
                      {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-4">{getStatusBadge(invoice.status)}</td>
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {invoice.invoice_pdf_url && (
                      <a
                        href={invoice.invoice_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 h-8 text-[12px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-lg transition-colors inline-flex items-center gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </a>
                    )}
                    {invoice.hosted_invoice_url && (
                      <a
                        href={invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 h-8 text-[12px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-lg transition-colors inline-flex items-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
