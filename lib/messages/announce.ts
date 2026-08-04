import "server-only"

/**
 * Tell whoever has this thread open that something landed in it — from the
 * SERVER, on the same request that wrote the row.
 *
 * There was already a broadcast, sent by the sender's browser after its POST
 * came back, and it has a failure mode that exactly matches the bug it was
 * meant to prevent: it depends on the sender's socket. `announce()` in
 * components/messages/thread.tsx does nothing at all unless that client's
 * channel reached SUBSCRIBED — and on a flaky connection, a cold WebView, or a
 * tab that navigates away the instant send returns, it has not. The message is
 * written, the recipient is never told, and it surfaces on their next poll.
 * "I have to leave the conversation and come back for the message to appear" is
 * that gap, measured.
 *
 * This closes it. Supabase Realtime accepts a broadcast over plain HTTP with
 * the service key, so the notification now comes from the one participant in
 * the exchange that is guaranteed to be present: the server that just committed
 * the insert. Same channel name and same event as the client sends, so a
 * listener needs no new code — and when both arrive, the second is coalesced
 * into the first by the 120ms debounce on the receiving end.
 *
 * Best effort, always. It is awaited with a short timeout and every failure is
 * swallowed: a send that succeeded must never be reported as failed because the
 * doorbell did not ring. The recipient's poll is the net under it.
 */
export async function announceThread(
  conversationId: string,
  event: "msg" | "read" | "typing" = "msg",
  payload: Record<string, unknown> = {},
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      // The topic is the channel name as supabase-js sees it — `thread:<uuid>`,
      // with no `realtime:` prefix. The payload carries no message CONTENT, on
      // purpose: the receiver re-reads the thread through its own session, so
      // nothing here needs to hold what was said, and a broadcast is not a place
      // to put it — anyone who can guess a conversation id could otherwise
      // listen. The only thing it ever carries is who acted, which the typing
      // indicator needs in order to ignore its own echo.
      body: JSON.stringify({
        messages: [{ topic: `thread:${conversationId}`, event, payload }],
      }),
      // Two seconds is far longer than this call ever takes and far shorter than
      // anyone should wait for a doorbell. Without it a hung socket would hold
      // the send response open.
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    /* the recipient's poll covers this */
  }
}
