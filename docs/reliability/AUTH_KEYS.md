# Supabase Auth signing keys: stop "Cannot reach the server" during Auth's slow minutes

## Why this matters

The Supabase project signs session tokens with the **legacy JWT secret**
(HS256). Its public key list is empty:

```
curl https://skgtqglupjcnfhfscink.supabase.co/auth/v1/.well-known/jwks.json
{"keys":[]}
```

With no public key, the only way the server could check who is signed in was
to ask Supabase Auth (`GET /auth/v1/user`) on every page and API call. When
Supabase Auth had a slow minute (Nov 1, 09:03 UTC: "auth/v1/user took longer
than 10s"), people with a valid session saw "We could not check your sign in
just now" or "Cannot reach the server".

The code on branch `claude/rel3-auth` (lib/auth/verify-token.ts) can now check
the token's signature itself, without asking Supabase Auth, in two ways:

| Setup | What the server needs | Status |
| --- | --- | --- |
| A. Asymmetric signing keys (recommended, permanent) | Nothing. It reads the public keys from the JWKS URL. | Owner action below |
| B. Legacy secret (interim) | `SUPABASE_JWT_SECRET` in Vercel | Owner action below |

Until one of the two is done, the new code behaves exactly like before (it
asks Supabase Auth). Either one is enough. Doing A makes B unnecessary.

Supabase Auth is still asked first everywhere it was. The local check is used
only when Auth does not answer in about 2.5 seconds, and in the proxy for
`/app`, `/dashboard` and `/sell` to decide "send to sign in or not". A token
with a bad signature, another project's issuer, the wrong audience or role, or
past its expiry is never accepted. If Supabase Auth says a session was revoked,
the person is still signed out.

## A. Recommended: move to asymmetric signing keys (ECC P-256)

Reference: https://supabase.com/docs/guides/auth/signing-keys

Nobody is signed out by these steps. Unexpired tokens signed with the old
secret keep working, and the legacy `anon` and `service_role` keys keep
working as long as the legacy secret is **not revoked**.

1. Open the Supabase Dashboard, project `skgtqglupjcnfhfscink`, then
   **Project Settings > JWT Keys** (the page is also titled "JWT Signing
   Keys", address `/settings/jwt`).
2. Click **Migrate JWT secret**. This imports the legacy secret into the new
   signing keys system and creates a new asymmetric key in **standby**. No
   downtime.
3. Check the standby key's algorithm on that page. It should be **ECC
   (P-256)**, shown as ES256. If it is not, create a new standby key and pick
   ECC P-256 (or import one made with `supabase gen signing-key --algorithm ES256`;
   keep the private key safe, Supabase cannot show it again).
4. Wait at least **20 minutes** after the standby key appears. The JWKS URL is
   cached for about 10 minutes at Supabase's edge, and the Storelib server
   keeps the keys for up to 10 minutes per instance (an unknown key id makes
   it fetch them again at most once a minute).
5. Click **Rotate keys**. The standby key becomes the current key and Auth
   signs new tokens with it. The legacy secret moves to "Previously used" and
   tokens it signed stay valid until they expire (one hour).
6. **Do not revoke the legacy secret.** The legacy `anon` and
   `service_role` API keys are JWTs signed by it; revoking it would break
   them. Revoke it only after the app has moved to the new publishable and
   secret API keys (Settings > API Keys, check the "last used" indicators),
   and then only at least 1 hour 15 minutes after the rotation. That is a
   separate project.
7. Verify: open
   https://skgtqglupjcnfhfscink.supabase.co/auth/v1/.well-known/jwks.json
   and check that `keys` now lists a key with `"kty":"EC"`, `"crv":"P-256"`,
   `"alg":"ES256"`. Public keys are safe to show; they cannot make tokens.
8. Nothing to deploy for this step: the server picks the keys up by itself
   within about 10 minutes. After it does, `/app` pages no longer wait on
   Supabase Auth to decide who is signed in when Auth is slow.

Edge Functions: if any Supabase Edge Function has "Verify JWT" on with the
legacy secret, check it still works after step 5 (Supabase's guide covers it).
Storelib's own code does not verify tokens with the secret anywhere else.

## B. Interim: give the server the legacy JWT secret

Use this if A cannot be done right away. It can be removed after A.

1. Supabase Dashboard > **Project Settings > JWT Keys**, the **Legacy JWT
   secret** tab (or section). Click reveal and copy the secret.
2. Vercel > the Storelib project > **Settings > Environment Variables** >
   Add:
   - Name: `SUPABASE_JWT_SECRET`
   - Value: the secret
   - Environment: **Production** (and Preview if previews should have it)
   - Mark it **Sensitive**.
3. Never paste the secret into a chat, an issue, a commit or a log. It can
   sign a token for any user. It must never get a `NEXT_PUBLIC_` prefix (that
   would put it in the browser). The code reads it only on the server
   (`lib/auth/verify-token.ts` is `server-only`, and a test fails if any
   client file imports it).
4. Redeploy production so the functions and the proxy read the new variable.
5. Verify: in Vercel logs, during a Supabase Auth slow minute, the line
   `auth_degraded` shows `"outcome":"claims"` instead of `"indeterminate"`,
   and no "Cannot reach the server" reports (`[auth-gate] cannot reach the
   server`) appear.

After A is done and verified, remove `SUPABASE_JWT_SECRET` from Vercel and
redeploy. If the legacy secret is ever revoked or rotated, remove or update
the variable at the same time (a wrong secret never signs anybody out; the
fallback just stops helping).

## What stays the same

- Every database call still carries the person's own token, so row level
  security applies exactly as before.
- API routes that change something (`routeUser()` with its default) still
  need Supabase Auth itself to answer; when it does not, they answer 503 and
  the browser asks again quietly (twice, with jitter) before showing "We could
  not check your sign in just now".
- What the local check cannot see is a session revoked less than an hour ago
  (the token's lifetime). Row level security cannot see that either. Supabase
  Auth is always asked first, so this only matters while Auth is not
  answering.
