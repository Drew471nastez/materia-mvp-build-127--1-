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
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const eventTypes = searchParams.get('eventTypes')?.split(',') || null
  const productId = searchParams.get('productId')

  try {
    // Build query for recent events with product details
    let query = supabase
      .from('analytics_events')
      .select(`
        id,
        event_type,
        session_id,
        created_at,
        metadata,
        country,
        city,
        device_type,
        browser,
        referrer,
        product_id,
        products:product_id (
          id,
          title,
          thumbnail_url
        )
      `)
      .eq('creator_id', creator.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (eventTypes && eventTypes.length > 0) {
      query = query.in('event_type', eventTypes)
    }

    if (productId && productId !== 'all') {
      query = query.eq('product_id', productId)
    }

    const { data: events, error } = await query

    if (error) {
      console.error('Events feed query error:', error)
      throw error
    }

    // Format events for display
    const formattedEvents = (events || []).map(event => {
      const eventLabels: Record<string, string> = {
        'view': 'Page View',
        'buy_click': 'Buy Button Click',
        'checkout_start': 'Checkout Started',
        'checkout_complete': 'Purchase Completed',
        'purchase': 'Purchase Completed',
        'link_click': 'Link Click',
        'social_click': 'Social Link Click',
        'scroll': 'Page Scroll',
      }

      const eventIcons: Record<string, string> = {
        'view': '👁️',
        'buy_click': '🛒',
        'checkout_start': '💳',
        'checkout_complete': '✅',
        'purchase': '✅',
        'link_click': '🔗',
        'social_click': '🌐',
        'scroll': '📜',
      }

      return {
        id: event.id,
        type: event.event_type,
        label: eventLabels[event.event_type] || event.event_type,
        icon: eventIcons[event.event_type] || '📊',
        sessionId: event.session_id,
        timestamp: event.created_at,
        country: event.country,
        city: event.city,
        deviceType: event.device_type,
        browser: event.browser,
        referrer: event.referrer,
        product: event.products ? {
          id: (event.products as any).id,
          title: (event.products as any).title,
          thumbnail: (event.products as any).thumbnail_url,
        } : null,
        metadata: event.metadata,
      }
    })

    // Get total count for pagination
    const { count } = await supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creator.id)

    return NextResponse.json({
      events: formattedEvents,
      total: count || 0,
      hasMore: (offset + limit) < (count || 0),
    })
  } catch (error) {
    console.error('Events feed error:', error)
    return NextResponse.json({ error: 'Failed to fetch events feed' }, { status: 500 })
  }
}
