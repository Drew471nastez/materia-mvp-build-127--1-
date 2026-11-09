"use client"

import { displayEmail } from "@/lib/businesses/email-alias"
import { useOnePage } from "@/lib/onepage/context"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, RefreshCw, Mail } from "lucide-react"
import type { OnePageLead } from "@/lib/onepage/types"

export function LeadsSection() {
  const { onepage } = useOnePage()
  const [leads, setLeads] = useState<OnePageLead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/onepage/leads")
      if (response.ok) {
        const data = await response.json()
        setLeads(data.leads || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error("Failed to fetch leads:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
  }, [])

  const exportToCsv = () => {
    if (leads.length === 0) return

    const headers = ["Email", "Name", "Date", "Source"]
    const rows = leads.map((lead) => [
      displayEmail(lead.email) ?? lead.email,
      lead.name || "",
      new Date(lead.created_at).toLocaleDateString(),
      lead.utm_source || lead.referrer || "",
    ])

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!onepage) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Leads</h2>
          <p className="text-sm text-muted-foreground">
            {total} email{total !== 1 ? "s" : ""} collected
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCsv} disabled={leads.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground">No leads yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Add an Email Capture block to start collecting emails
          </p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {leads.map((lead) => (
            <div key={lead.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{displayEmail(lead.email) ?? lead.email}</p>
                {lead.name && (
                  <p className="text-xs text-muted-foreground">{lead.name}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {new Date(lead.created_at).toLocaleDateString()}
                </p>
                {lead.utm_source && (
                  <p className="text-xs text-muted-foreground">via {lead.utm_source}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
