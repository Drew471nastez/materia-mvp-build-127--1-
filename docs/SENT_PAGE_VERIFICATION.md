# Email Sent Page - Verification Checklist

## Pre-requisites

1. **Run the SQL migration** in Supabase SQL Editor:
   - Open `/supabase/migrations/20260203_rebuild_email_sent_system.sql`
   - Copy and paste the entire contents into Supabase SQL Editor
   - Run the migration
   - Verify no errors occurred

## Test Cases

### 1. Campaign Send Flow

- [ ] Go to Emails > New email
- [ ] Enter subject: "Test Email"
- [ ] Enter body with some text and a link
- [ ] Select audience (All subscribers)
- [ ] Click "Send"
- [ ] Verify toast shows "Email sent! Successfully sent to X subscribers"
- [ ] Verify automatically navigated to Sent tab
- [ ] Verify the new campaign appears in the list immediately
- [ ] Verify Total Sent KPI increased
- [ ] Verify Monthly Limit usage increased

### 2. Open Tracking

- [ ] Send a test email to yourself
- [ ] Open the email in your email client
- [ ] Wait 10-30 seconds
- [ ] Refresh the Sent tab
- [ ] Click on the campaign to view stats
- [ ] Verify Opens count increased to 1
- [ ] Open the email again
- [ ] Verify Opens count stays at 1 (unique opens only)

### 3. Click Tracking

- [ ] Send a test email with links
- [ ] Open the email and click a link
- [ ] Verify you're redirected to the correct URL
- [ ] Refresh the Sent tab
- [ ] View campaign stats
- [ ] Verify Clicks count is 1

### 4. Unsubscribe Flow

- [ ] Send a test email
- [ ] Click the "Unsubscribe" link in the email footer
- [ ] Verify you see "Unsubscribed Successfully" page
- [ ] Refresh the Sent tab
- [ ] Verify Unsubscribed count increased
- [ ] Go to Subscribers tab
- [ ] Verify the subscriber shows as "unsubscribed"

### 5. Resend Flow

- [ ] On a sent campaign, click "..." > Resend
- [ ] Verify campaign is resent
- [ ] Verify a new campaign "(Resend)" appears in the list
- [ ] Verify both campaigns show in the list

### 6. Date Filter

- [ ] Select "Last 7 days" filter
- [ ] Verify KPIs update to show only last 7 days stats
- [ ] Select "Last 30 days" filter
- [ ] Verify KPIs show last 30 days stats
- [ ] Select "All time" filter
- [ ] Verify KPIs show all stats

### 7. Monthly Limit

- [ ] Verify Monthly Limit card shows X of 3,000
- [ ] Verify the progress ring matches the percentage
- [ ] Send more emails
- [ ] Verify the sent count increases

## Database Tables

After running the migration, verify these tables exist:

### email_events
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'email_events' ORDER BY ordinal_position;
```
Expected columns:
- id (uuid)
- campaign_id (uuid)
- flow_id (uuid)
- creator_id (uuid)
- email (text)
- event_type (text)
- url (text)
- user_agent (text)
- ip_address (text)
- metadata (jsonb)
- created_at (timestamp with time zone)

### email_campaigns
Verify it has:
- audience_count column
- status includes: draft, scheduled, sending, sent, failed

### email_sends
Verify it has:
- email column
- opened_at column
- clicked_at column

## API Endpoints

Test each endpoint:

### GET /api/email/stats
```bash
curl -H "Cookie: your-auth-cookie" "https://yoursite.com/api/email/stats?timeRange=30d"
```
Expected response:
```json
{
  "campaigns": [...],
  "stats": {
    "totalSent": 100,
    "totalOpens": 25,
    "totalClicks": 10,
    "totalUnsubscribed": 2,
    "openRate": 25,
    "clickRate": 10
  },
  "monthlyUsage": {
    "sent": 50,
    "limit": 3000
  }
}
```

### GET /api/email/track (Open tracking pixel)
```bash
curl "https://yoursite.com/api/email/track?cid=CAMPAIGN_ID&e=test@example.com"
```
Expected: 1x1 transparent GIF returned

### GET /api/email/click (Click tracking redirect)
```bash
curl "https://yoursite.com/api/email/click?cid=CAMPAIGN_ID&e=test@example.com&url=BASE64_ENCODED_URL"
```
Expected: 302 redirect to target URL

## Troubleshooting

### Stats not updating
1. Check browser console for errors
2. Check server logs for [stats] or [emails page] entries
3. Verify email_events table has the correct data:
```sql
SELECT * FROM email_events WHERE creator_id = 'YOUR_CREATOR_ID' ORDER BY created_at DESC LIMIT 20;
```

### Opens/Clicks not tracking
1. Check if email_events table has RLS disabled:
```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'email_events';
```
Should return false (f).

2. Check for errors in server logs when loading tracking pixel/click URL

### Campaign not appearing after send
1. Check email_campaigns table:
```sql
SELECT * FROM email_campaigns WHERE creator_id = 'YOUR_CREATOR_ID' ORDER BY created_at DESC LIMIT 5;
```
2. Verify status is 'sent' not 'sending' or 'draft'
3. Check audience_count is > 0

## Files Changed

- `supabase/migrations/20260203_rebuild_email_sent_system.sql` - Database schema
- `app/api/email/stats/route.ts` - Stats API endpoint
- `app/api/email/send/route.ts` - Send campaign endpoint
- `app/api/email/track/route.ts` - Open tracking pixel
- `app/api/email/click/route.ts` - Click tracking redirect
- `app/api/email/unsubscribe/route.ts` - Unsubscribe handler
- `app/(storelib)/app/emails/page.tsx` - Frontend emails page
