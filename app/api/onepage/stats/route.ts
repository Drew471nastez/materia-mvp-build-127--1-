import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const onepageId = searchParams.get("onepage_id")
    const blockId = searchParams.get("block_id")
    const days = parseInt(searchParams.get("days") || "7", 10)
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!onepageId) {
      return NextResponse.json({ error: "Missing onepage_id" }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user owns this onepage
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: onepage } = await supabase
      .from("onepages")
      .select("owner_id")
      .eq("id", onepageId)
      .maybeSingle()

    if (!onepage || onepage.owner_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Calculate date range
    let startDate: Date
    let endDate: Date = new Date()
    let numDays: number

    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      endDate.setHours(23, 59, 59, 999)
      numDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    } else {
      startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      numDays = days
    }
    const startDateStr = startDate.toISOString()
    const endDateStr = endDate.toISOString()

    if (blockId) {
      // Get stats for specific block - both views (page views) and clicks
      const [viewsResult, clicksResult] = await Promise.all([
        supabase
          .from("onepage_views")
          .select("created_at")
          .eq("onepage_id", onepageId)
          .gte("created_at", startDateStr)
          .lte("created_at", endDateStr),
        supabase
          .from("onepage_clicks")
          .select("created_at")
          .eq("onepage_id", onepageId)
          .eq("block_id", blockId)
          .gte("created_at", startDateStr)
          .lte("created_at", endDateStr)
          .order("created_at", { ascending: true })
      ])

      // Group by day
      const dailyStats: Record<string, { views: number; clicks: number }> = {}
      const today = customEndDate ? new Date(customEndDate) : new Date()
      for (let i = numDays - 1; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateKey = date.toISOString().split("T")[0]
        dailyStats[dateKey] = { views: 0, clicks: 0 }
      }

      viewsResult.data?.forEach((view) => {
        const dateKey = new Date(view.created_at).toISOString().split("T")[0]
        if (dailyStats[dateKey] !== undefined) {
          dailyStats[dateKey].views++
        }
      })

      clicksResult.data?.forEach((click) => {
        const dateKey = new Date(click.created_at).toISOString().split("T")[0]
        if (dailyStats[dateKey] !== undefined) {
          dailyStats[dateKey].clicks++
        }
      })

      const chartData = Object.entries(dailyStats).map(([date, stats]) => ({
        date,
        views: stats.views,
        clicks: stats.clicks,
      }))

      return NextResponse.json({
        total_views: viewsResult.data?.length || 0,
        total_clicks: clicksResult.data?.length || 0,
        chart_data: chartData,
      })
    } else {
      // Get overall stats for onepage
      const [viewsResult, clicksResult] = await Promise.all([
        supabase
          .from("onepage_views")
          .select("created_at")
          .eq("onepage_id", onepageId)
          .gte("created_at", startDateStr),
        supabase
          .from("onepage_clicks")
          .select("created_at, block_id")
          .eq("onepage_id", onepageId)
          .gte("created_at", startDateStr),
      ])

      // Group by day
      const dailyStats: Record<string, { views: number; clicks: number }> = {}
      const today = new Date()
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateKey = date.toISOString().split("T")[0]
        dailyStats[dateKey] = { views: 0, clicks: 0 }
      }

      viewsResult.data?.forEach((view) => {
        const dateKey = new Date(view.created_at).toISOString().split("T")[0]
        if (dailyStats[dateKey]) {
          dailyStats[dateKey].views++
        }
      })

      clicksResult.data?.forEach((click) => {
        const dateKey = new Date(click.created_at).toISOString().split("T")[0]
        if (dailyStats[dateKey]) {
          dailyStats[dateKey].clicks++
        }
      })

      // Get per-block click counts
      const blockClicks: Record<string, number> = {}
      clicksResult.data?.forEach((click) => {
        blockClicks[click.block_id] = (blockClicks[click.block_id] || 0) + 1
      })

      const chartData = Object.entries(dailyStats).map(([date, stats]) => ({
        date,
        views: stats.views,
        clicks: stats.clicks,
      }))

      return NextResponse.json({
        total_views: viewsResult.data?.length || 0,
        total_clicks: clicksResult.data?.length || 0,
        block_clicks: blockClicks,
        chart_data: chartData,
      })
    }
  } catch (error) {
    console.error("Stats error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
