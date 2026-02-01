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
    .select('id, display_name')
    .eq('user_id', user.id)
    .single()

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
  }

  const searchParams = req.nextUrl.searchParams
  const format = searchParams.get('format') || 'csv'
  const timeframe = searchParams.get('timeframe') || '30d'
  const customStart = searchParams.get('customStart')
  const customEnd = searchParams.get('customEnd')
  const dataType = searchParams.get('dataType') || 'overview' // overview, products, events

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
    let csvContent = ''
    let filename = ''

    if (dataType === 'products') {
      // Export product insights
      const { data: products } = await supabase
        .from('products')
        .select('id, title, price_cents')
        .eq('creator_id', creator.id)

      if (!products || products.length === 0) {
        csvContent = 'No products found'
      } else {
        const productInsights = await Promise.all(
          products.map(async (product) => {
            const { data: viewSessions } = await supabase
              .from('analytics_events')
              .select('session_id')
              .eq('creator_id', creator.id)
              .eq('product_id', product.id)
              .eq('event_type', 'view')
              .gte('created_at', startDate.toISOString())
              .lte('created_at', endDate.toISOString())

            const uniqueViews = new Set(viewSessions?.map(v => v.session_id).filter(Boolean) || []).size

            const { data: clickSessions } = await supabase
              .from('analytics_events')
              .select('session_id')
              .eq('creator_id', creator.id)
              .eq('product_id', product.id)
              .eq('event_type', 'buy_click')
              .gte('created_at', startDate.toISOString())
              .lte('created_at', endDate.toISOString())

            const uniqueClicks = new Set(clickSessions?.map(c => c.session_id).filter(Boolean) || []).size

            const { data: orders, count: orderCount } = await supabase
              .from('orders')
              .select('id, amount_cents', { count: 'exact' })
              .eq('product_id', product.id)
              .eq('status', 'completed')
              .gte('created_at', startDate.toISOString())
              .lte('created_at', endDate.toISOString())

            const totalOrders = orderCount || 0
            const totalRevenue = orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0
            const conversionRate = uniqueViews > 0 ? (totalOrders / uniqueViews) * 100 : 0

            return {
              title: product.title,
              price: (product.price_cents / 100).toFixed(2),
              views: uniqueViews,
              clicks: uniqueClicks,
              orders: totalOrders,
              revenue: (totalRevenue / 100).toFixed(2),
              conversionRate: conversionRate.toFixed(2),
            }
          })
        )

        csvContent = 'Product,Price,Views,Clicks,Orders,Revenue,Conversion Rate %\n'
        productInsights.forEach(p => {
          csvContent += `"${p.title}",${p.price},${p.views},${p.clicks},${p.orders},${p.revenue},${p.conversionRate}\n`
        })
      }
      filename = `product-insights-${timeframe}`

    } else if (dataType === 'events') {
      // Export events
      const { data: events } = await supabase
        .from('analytics_events')
        .select(`
          event_type,
          session_id,
          created_at,
          country,
          city,
          device_type,
          browser,
          referrer,
          products:product_id (title)
        `)
        .eq('creator_id', creator.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000)

      csvContent = 'Timestamp,Event Type,Product,Country,City,Device,Browser,Referrer,Session ID\n'
      events?.forEach(e => {
        const productTitle = e.products ? (e.products as any).title : ''
        csvContent += `"${e.created_at}","${e.event_type}","${productTitle || ''}","${e.country || ''}","${e.city || ''}","${e.device_type || ''}","${e.browser || ''}","${e.referrer || ''}","${e.session_id || ''}"\n`
      })
      filename = `events-${timeframe}`

    } else {
      // Export overview
      const { data: viewSessions } = await supabase
        .from('analytics_events')
        .select('session_id')
        .eq('creator_id', creator.id)
        .eq('event_type', 'view')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const uniqueViews = new Set(viewSessions?.map(v => v.session_id).filter(Boolean) || []).size

      const { data: clickSessions } = await supabase
        .from('analytics_events')
        .select('session_id')
        .eq('creator_id', creator.id)
        .eq('event_type', 'buy_click')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const uniqueClicks = new Set(clickSessions?.map(c => c.session_id).filter(Boolean) || []).size

      const { data: checkoutSessions } = await supabase
        .from('analytics_events')
        .select('session_id')
        .eq('creator_id', creator.id)
        .eq('event_type', 'checkout_start')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const uniqueCheckouts = new Set(checkoutSessions?.map(c => c.session_id).filter(Boolean) || []).size

      const { data: purchaseSessions } = await supabase
        .from('analytics_events')
        .select('session_id')
        .eq('creator_id', creator.id)
        .in('event_type', ['checkout_complete', 'purchase'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const uniquePurchases = new Set(purchaseSessions?.map(p => p.session_id).filter(Boolean) || []).size

      const { data: orders } = await supabase
        .from('orders')
        .select('amount_cents')
        .eq('creator_id', creator.id)
        .eq('status', 'completed')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const totalRevenue = orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0
      const conversionRate = uniqueViews > 0 ? (uniquePurchases / uniqueViews) * 100 : 0

      csvContent = 'Analytics Overview Report\n'
      csvContent += `Period,${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n\n`
      csvContent += 'Metric,Value\n'
      csvContent += `Total Views,${uniqueViews}\n`
      csvContent += `Product Clicks,${uniqueClicks}\n`
      csvContent += `Checkout Starts,${uniqueCheckouts}\n`
      csvContent += `Purchases,${uniquePurchases}\n`
      csvContent += `Total Revenue,$${(totalRevenue / 100).toFixed(2)}\n`
      csvContent += `Conversion Rate,${conversionRate.toFixed(2)}%\n`
      filename = `analytics-overview-${timeframe}`
    }

    if (format === 'csv') {
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      })
    } else {
      // For PDF, return JSON data that the client can render
      return NextResponse.json({
        success: true,
        data: csvContent,
        filename: `${filename}.pdf`,
      })
    }
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
