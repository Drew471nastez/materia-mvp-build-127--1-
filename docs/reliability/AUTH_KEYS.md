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

## Where production stands (round 49, Nov 2)

Read from production logs and public URLs only (no environment value was
read): the JWKS is still `{"keys":[]}`, and the `auth_degraded` lines on
deployment `dpl_2BhGDvSAM6igSWt4dVH9VoxazAtT` (Nov 2, 07:40-07:54 UTC) say
`"outcome":"claims"`. With an empty JWKS that can only come from the shared
secret, so **step B is in place**: `/app` pages and the proxy already verify
tokens locally.

What still showed "We could not check your sign in just now" was the API
routes behind the panels (Send analytics, markets, translations, own/token):
they asked Supabase Auth themselves, strictly, and a retry queued behind the
hung first try. Round 49 (`tests/auth-r49.test.ts`) moves every read-only GET
onto the same answer the pages use, keeps changes strict with real retries,
and adds a header to confirm which check ran (below).

The remaining owner step is A, the permanent fix: it removes the shared
secret from Vercel, and the server then needs no secret at all.

## Confirm it worked: the X-Storelib-Auth-Check header

Signed in, open `https://storelib.com/app`, then the browser's developer
tools > Network, click the first (document) request and read its Response
headers:

| Header value | Meaning |
| --- | --- |
| `proxy-local; verifier=hs256` | local check active, from `SUPABASE_JWT_SECRET` (B) |
| `proxy-local; verifier=jwks` | local check active, from the public keys (A done) |
| `proxy-network; verifier=none` | no local check: Supabase Auth asked on every page (neither A nor B) |

The same header is on `https://storelib.com/api/auth/state` (open it in a
signed-in tab): `network; verifier=...` when Supabase Auth answered, `local;
verifier=...` when Auth was slow and the token's signature answered. A 503
"could not check" carries `none`. The header names the kind of check only,
never a key, a token or an account. In Vercel logs, `auth_degraded` lines now
also carry `"verifier"`.

After A: the header reads `verifier=jwks` within about 10 minutes. Then remove
`SUPABASE_JWT_SECRET` (B's last paragraph) and redeploy; the header must still
read `verifier=jwks`.

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

## Round 52: the token's signature is the first check, not the fallback

The owner, Nov 5: "We could not check your sign in just now. Try again in a
moment", on saves, publishes and settings everywhere. Every API route that
changed something used `routeUser()`, whose default asked Supabase Auth
itself and waited for it (about 10 s with retries) before refusing. A slow
Auth refused every change on the platform, though the page around it had
the person from the token.

Since round 52 (`lib/auth/request-scope.ts` `currentUserForRequest`,
`lib/auth/route-user.ts` `routeUser`):

- Pages, API reads and ordinary changes (saves, publishes, settings, the
  website editor, uploads, the account's own settings) check the access
  token here: signature, expiry, issuer, audience, role. This is Supabase's
  `getClaims` and exactly what PostgREST does on every query. Supabase Auth
  is not asked at all, so its slow minutes no longer reach these.
- Auth is still asked, as before, when the token cannot be checked here (no
  secret, no keys) or does not check out. An expired, forged or foreign token
  is never accepted.
- **The strict list still asks Supabase Auth itself** (`routeUser({ fresh:
  true })` or a direct Auth read): account deletion; email change (both
  steps) and the password changed hook; AI keys; agent connection keys;
  marketing and tracking integration keys; payout settings; every payouts,
  bank and billing change through `moneyCaller` at "manage"; Stripe Connect
  disconnect; refunds; team invites, roles and removals (`requestUser`); the
  statement descriptor; web push subscriptions. Admin has its own signed
  cookie and never used Supabase Auth. `tests/auth-strict-r52.test.ts`
  names each one.
- Reads that need what a token does not carry (`email_confirmed_at`,
  `identities`) keep Auth first with the signature as the fallback
  (`fullUserForRequest`): checkout, the library and its memberships, a
  community's paid checkout.

### What this trusts, and for how long

A valid signed token is trusted until it expires. A session ended inside
that window (signed out elsewhere, a password reset) is still accepted by
ordinary routes until the token runs out, exactly as row level security
already accepted it on every query. The strict list above does not accept it.

The window is the project's access token lifetime:

- Supabase Dashboard > **Project Settings > JWT Keys** > **Access token
  expiry time** (older dashboards: Settings > API > JWT Settings > "JWT
  expiry limit"). Default 3600 seconds.
- Recommended: **keep 3600**. Every renewal is a request to Supabase Auth
  made by the proxy, so a shorter lifetime brings Auth's slow minutes back
  into more page loads. If a shorter window matters more, 1800 is the
  lowest worth using; never below 900.

### What the server needs for this to work

Without a local key nothing changes: every request asks Auth as before, and
the message can still show. Each server instance now logs once which check
it has. Vercel > Logs, search `auth_verifier`:

| Line | Meaning |
| --- | --- |
| `"mode":"hs256","local":true` | `SUPABASE_JWT_SECRET` is set (B) |
| `"mode":"jwks","local":true` | asymmetric signing keys are published (A done) |
| `"mode":"none","local":false` | **neither**: do A or B, or the fix above does nothing |

The X-Storelib-Auth-Check header now reads `local; verifier=...` on a
normal request (it used to read `network` when Auth was fine), and
`network` only when the token could not be checked here.

## What stays the same

- Every database call still carries the person's own token, so row level
  security applies exactly as before.
- A strict route that Auth does not answer is refused with 503 and nothing
  is done; the browser asks again quietly before showing "We could not
  check your sign in just now".
- A forged, altered, expired or foreign token, `alg: none`, or the anon
  role is never a user. Auth's own "no" is final wherever Auth is asked.
