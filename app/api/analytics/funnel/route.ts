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
  const productId = searchParams.get('productId')
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
    // Build base query conditions
    const baseConditions = {
      creator_id: creator.id,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    }

    // Query for distinct sessions at each funnel step
    // Step 1: Views (distinct sessions that viewed)
    let viewsQuery = supabase
      .from('analytics_events')
      .select('session_id')
      .eq('creator_id', creator.id)
      .eq('event_type', 'view')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (productId && productId !== 'all') {
      viewsQuery = viewsQuery.eq('product_id', productId)
    }

    const { data: viewSessions } = await viewsQuery
    const uniqueViewSessions = new Set(viewSessions?.map(v => v.session_id).filter(Boolean) || [])

    // Step 2: Product clicks (buy_click events - distinct sessions)
    let clicksQuery = supabase
      .from('analytics_events')
      .select('session_id')
      .eq('creator_id', creator.id)
      .eq('event_type', 'buy_click')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (productId && productId !== 'all') {
      clicksQuery = clicksQuery.eq('product_id', productId)
    }

    const { data: clickSessions } = await clicksQuery
    const uniqueClickSessions = new Set(clickSessions?.map(c => c.session_id).filter(Boolean) || [])

    // Step 3: Checkout started (distinct sessions)
    let checkoutStartQuery = supabase
      .from('analytics_events')
      .select('session_id')
      .eq('creator_id', creator.id)
      .eq('event_type', 'checkout_start')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (productId && productId !== 'all') {
      checkoutStartQuery = checkoutStartQuery.eq('product_id', productId)
    }

    const { data: checkoutStartSessions } = await checkoutStartQuery
    const uniqueCheckoutStartSessions = new Set(checkoutStartSessions?.map(c => c.session_id).filter(Boolean) || [])

    // Step 4: Purchases (checkout_complete or purchase events - distinct sessions)
    let purchaseQuery = supabase
      .from('analytics_events')
      .select('session_id')
      .eq('creator_id', creator.id)
      .in('event_type', ['checkout_complete', 'purchase'])
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (productId && productId !== 'all') {
      purchaseQuery = purchaseQuery.eq('product_id', productId)
    }

    const { data: purchaseSessions } = await purchaseQuery
    const uniquePurchaseSessions = new Set(purchaseSessions?.map(p => p.session_id).filter(Boolean) || [])

    // Calculate funnel data
    const views = uniqueViewSessions.size
    const clicks = uniqueClickSessions.size
    const checkoutStarts = uniqueCheckoutStartSessions.size
    const purchases = uniquePurchaseSessions.size

    // Calculate drop-off percentages
    const viewToClickRate = views > 0 ? (clicks / views) * 100 : 0
    const clickToCheckoutRate = clicks > 0 ? (checkoutStarts / clicks) * 100 : 0
    const checkoutToPurchaseRate = checkoutStarts > 0 ? (purchases / checkoutStarts) * 100 : 0
    const overallConversionRate = views > 0 ? (purchases / views) * 100 : 0

    const funnelData = {
      steps: [
        {
          name: 'Views',
          count: views,
          dropOffRate: 0,
          conversionRate: 100,
        },
        {
          name: 'Product Clicks',
          count: clicks,
          dropOffRate: views > 0 ? ((views - clicks) / views) * 100 : 0,
          conversionRate: viewToClickRate,
        },
        {
          name: 'Checkout Started',
          count: checkoutStarts,
          dropOffRate: clicks > 0 ? ((clicks - checkoutStarts) / clicks) * 100 : 0,
          conversionRate: clickToCheckoutRate,
        },
        {
          name: 'Purchase',
          count: purchases,
          dropOffRate: checkoutStarts > 0 ? ((checkoutStarts - purchases) / checkoutStarts) * 100 : 0,
          conversionRate: checkoutToPurchaseRate,
        },
      ],
      overallConversionRate,
      totalViews: views,
      totalPurchases: purchases,
    }

    return NextResponse.json(funnelData)
  } catch (error) {
    console.error('Funnel analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch funnel data' }, { status: 500 })
  }
}
