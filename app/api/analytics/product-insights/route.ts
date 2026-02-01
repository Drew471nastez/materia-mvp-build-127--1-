import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get creator ID
  const { data: creator } = await supabase
    .from('creators')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
  }

  const searchParams = req.nextUrl.searchParams
  const timeframe = searchParams.get('timeframe') || '30d'
  const customStart = searchParams.get('customStart')
  const customEnd = searchParams.get('customEnd')

  // Calculate date range
  let startDate: Date
  let endDate = new Date()

  if (timeframe === 'custom' && customStart && customEnd) {
    startDate = new Date(customStart)
    endDate = new Date(customEnd)
    endDate.setHours(23, 59, 59, 999)
  } else {
    switch (timeframe) {
      case 'today':
        startDate = new Date()
        startDate.setHours(0, 0, 0, 0)
        break
      case 'yesterday':
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 1)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(startDate)
        endDate.setHours(23, 59, 59, 999)
        break
      case '7d':
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 7)
        break
      case '30d':
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 30)
        break
      case '6m':
        startDate = new Date()
        startDate.setMonth(startDate.getMonth() - 6)
        break
      case '1y':
        startDate = new Date()
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
      default:
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 30)
    }
  }

  try {
    // Get all products for this creator
    const { data: products } = await supabase
      .from('products')
      .select('id, title, price_cents, thumbnail_url')
      .eq('creator_id', creator.id)

    if (!products || products.length === 0) {
      return NextResponse.json({ products: [] })
    }

    const productInsights = await Promise.all(
      products.map(async (product) => {
        // Views (distinct sessions)
        const { data: viewSessions } = await supabase
          .from('analytics_events')
          .select('session_id')
          .eq('creator_id', creator.id)
          .eq('product_id', product.id)
          .eq('event_type', 'view')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())

        const uniqueViews = new Set(viewSessions?.map(v => v.session_id).filter(Boolean) || []).size

        // Product clicks (distinct sessions)
        const { data: clickSessions } = await supabase
          .from('analytics_events')
          .select('session_id')
          .eq('creator_id', creator.id)
          .eq('product_id', product.id)
          .eq('event_type', 'buy_click')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())

        const uniqueClicks = new Set(clickSessions?.map(c => c.session_id).filter(Boolean) || []).size

        // Checkout starts (distinct sessions)
        const { data: checkoutSessions } = await supabase
          .from('analytics_events')
          .select('session_id')
          .eq('creator_id', creator.id)
          .eq('product_id', product.id)
          .eq('event_type', 'checkout_start')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())

        const uniqueCheckoutStarts = new Set(checkoutSessions?.map(c => c.session_id).filter(Boolean) || []).size

        // Orders from orders table
        const { data: orders, count: orderCount } = await supabase
          .from('orders')
          .select('id, amount_cents', { count: 'exact' })
          .eq('product_id', product.id)
          .eq('status', 'completed')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())

        const totalOrders = orderCount || 0
        const totalRevenue = orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0

        // Conversion rate (orders / views)
        const conversionRate = uniqueViews > 0 ? (totalOrders / uniqueViews) * 100 : 0

        return {
          id: product.id,
          title: product.title,
          thumbnail_url: product.thumbnail_url,
          price_cents: product.price_cents,
          views: uniqueViews,
          clicks: uniqueClicks,
          checkoutStarts: uniqueCheckoutStarts,
          orders: totalOrders,
          revenue: totalRevenue,
          conversionRate: Math.round(conversionRate * 100) / 100,
        }
      })
    )

    // Sort by revenue descending
    productInsights.sort((a, b) => b.revenue - a.revenue)

    return NextResponse.json({ products: productInsights })
  } catch (error) {
    console.error('Product insights error:', error)
    return NextResponse.json({ error: 'Failed to fetch product insights' }, { status: 500 })
  }
}
