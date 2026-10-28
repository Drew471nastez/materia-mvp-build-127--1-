import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { updateMember } from "@/lib/team/server"

type Params = { params: Promise<{ memberId: string }> }

/**
 * PATCH { permissions }: change what a member may do. DELETE: remove them, or
 * take back an invite. The store's owner, or a member given Team, for people
 * whose access is within their own (lib/team/server teamScope, updateMember).
 */
export async function PATCH(req: Request, { params }: Params) {
  const user = await requestUser(req)
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 })
  const { memberId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = (await req.json().catch(() => null)) as { permissions?: unknown; role?: unknown } | null
  const out = await updateMember(createAdminClient(), user.id, memberId, { permissions: body?.permissions, role: body?.role })
  return out.ok ? NextResponse.json({ ok: true, member: out.member ?? null }) : NextResponse.json({ error: out.error }, { status: out.status })
}

export async function DELETE(req: Request, { params }: Params) {
  const user = await requestUser(req)
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 })
  const { memberId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const out = await updateMember(createAdminClient(), user.id, memberId, { remove: true })
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status })
}
