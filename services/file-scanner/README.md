# Storelib file scanner (optional)

A small, authenticated HTTP API in front of ClamAV, kept here as an
**optional** malware engine for Storelib. It is **not needed** and **not
used** in production today.

Storelib checks every upload itself, with nothing to deploy
(`lib/security/uploads`): the file's real signature against its name and
declared type, programs and launchers refused (disguised ones too), scripts
and web pages behind a document's name, the EICAR test file, a ZIP's table of
contents (zip bombs, `../` paths, programs inside), cleaned names, size limits
per kind of upload. This scanner adds a full antivirus read on top, in the
background, when it is switched on with **one explicit flag**:

```
SECURITY_MALWARE_PROVIDER=clamav
CLAMAV_SERVICE_URL=https://scanner.yourdomain.com
CLAMAV_SERVICE_SECRET=<the scanner's secret>
```

Without `SECURITY_MALWARE_PROVIDER=clamav`, Storelib makes no call to it and
nothing waits for it, whatever the two `CLAMAV_*` variables hold.

```
Storelib on Vercel  ──HTTPS, Bearer secret──▶  scanner API (Node)  ──INSTREAM, private network──▶  clamd
                                                                                                   ▲
                                                                                 freshclam keeps the signatures fresh
```

- `GET /health` needs no secret. It answers whether clamd responds to PING,
  the ClamAV version, the signature database version and how old it is.
  200 when scanning works (`status` is `ok`, or `degraded` when the
  signatures are older than `MAX_SIGNATURE_AGE_HOURS`), 503 when it does not.
- `POST /scan` needs `Authorization: Bearer <CLAMAV_SERVICE_SECRET>`. The
  request body is the file, raw (`application/octet-stream`). It is streamed
  to clamd as it arrives and never written to disk.

```json
{
  "status": "infected",
  "threat": "Eicar-Test-Signature",
  "sha256": "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f",
  "bytes": 68,
  "durationMs": 15,
  "engine": { "version": "1.4.6", "signatures": 28129, "updatedAt": "2026-09-20T06:26:26.000Z" },
  "requestId": "0417d856-e743-436c-b7b5-fdbf06659f5c"
}
```

`status` is `clean`, `infected` or `error`. `clean` and `infected` are both
HTTP 200. An `error` carries `error` (a code) and `message`, with an HTTP
status that says why:

| HTTP | `error` | Meaning |
| ---: | --- | --- |
| 400 | `empty_body`, `bad_request` | Nothing to scan, or a broken request |
| 401 | `unauthorized` | Missing or wrong secret |
| 413 | `too_large` | Over `MAX_FILE_BYTES` (checked on `Content-Length` before reading, and on the bytes as they arrive) |
| 415 | `unsupported_media_type` | Multipart. Send the raw file |
| 429 | `rate_limited` | Too many scans, or too many wrong secrets, from one caller. See `Retry-After` |
| 502 | `engine_error` | ClamAV failed on this file |
| 503 | `clamd_unavailable`, `busy`, `shutting_down` | clamd is down or every slot is taken. See `Retry-After` |
| 504 | `timeout` | No verdict within `SCAN_TIMEOUT_MS` |

## What it does to be safe

- **clamd is never public.** In Docker Compose the `clamav` service has no
  `ports:`; only the API on the private `scanner` network reaches port 3310.
  In the single container image clamd listens on 127.0.0.1 and a unix socket.
- **The secret** is compared in constant time (both sides SHA-256 hashed,
  then `crypto.timingSafeEqual`). The service refuses to start without one of
  at least 32 characters. A caller that sends wrong secrets is slowed down
  (`AUTH_FAILURES_PER_MINUTE`).
- **Limits:** a size limit on `Content-Length` and on the bytes counted as
  they stream (clamd's own `StreamMaxLength` is set just above it), a timeout
  from first byte to verdict, a token bucket per caller, and a cap on scans
  running at once with a short queue.
- **No temporary files** in the API: the upload goes from the socket to clamd.
  clamd spools the stream in its own container's temp directory and deletes
  it when the scan ends. The API's root filesystem is read only.
- **Logs** are one JSON object a line: request id, caller IP, verdict, threat,
  size, SHA-256, duration. Never the file's bytes, never a header, never the
  secret.
- **Graceful shutdown:** on SIGTERM it stops taking scans, lets the ones in
  flight finish (up to `SHUTDOWN_GRACE_MS`), then exits.
- No npm dependencies. Node 20 or newer.

## Run it on your computer (Docker Desktop)

```bash
cd services/file-scanner
cp .env.example .env
# put a secret in .env:  CLAMAV_SERVICE_SECRET=<output of: openssl rand -hex 32>
docker compose up -d --build
docker compose ps          # both "healthy" after a minute or so
curl http://localhost:8080/health
```

The first start downloads about 300 MB of signatures unless the image
already has them, and clamd takes about a minute to load them. Give Docker
Desktop at least 4 GB of memory (Settings, Resources).

Scan the EICAR test file (a harmless string every antivirus reports):

```bash
source .env
printf '%s%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$' 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt
curl -s -X POST http://localhost:8080/scan \
  -H "Authorization: Bearer $CLAMAV_SERVICE_SECRET" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/eicar.txt
# {"status":"infected","threat":"Eicar-Test-Signature",...}
```

Or run the whole check (health, wrong secret, clean file, EICAR, a 50 MB file):

```bash
SCANNER_URL=http://localhost:8080 CLAMAV_SERVICE_SECRET=... node scripts/e2e.mjs
```

To try Storelib against it locally, put these in Storelib's `.env.local`
(plain `http` is accepted for localhost only):

```
CLAMAV_SERVICE_URL=http://localhost:8080
CLAMAV_SERVICE_SECRET=<the same secret>
```

## Tests

```bash
cd services/file-scanner
npm test        # node --test: auth, limits, rate limits, reply parsing, timeouts,
                # and the HTTP API against a fake clamd that speaks INSTREAM
```

They also run as part of Storelib's `pnpm run test:push`
(`tests/file-scanner.test.ts`).

## Put it in production

ClamAV holds its signatures in memory: plan on **3 GB of RAM** (about 1.3 GB
steady, briefly twice that while it loads a signature update) and 1 vCPU. A
256 MB container is plenty for the API itself. Anything smaller than 2 GB for
clamd will be killed while it loads.

Pick one of these. Each ends with an https address for the scanner.

### A VPS (Hetzner, DigitalOcean, Lightsail): the simplest and cheapest

1. A 4 GB machine with Docker installed. Copy this folder to it.
2. `cp .env.example .env`, set `CLAMAV_SERVICE_SECRET`, and set `API_PORT=127.0.0.1:8080`
   so the API is reachable only through the proxy below.
3. `docker compose up -d --build`
4. Put HTTPS in front with Caddy (automatic certificates). `/etc/caddy/Caddyfile`:

   ```
   scanner.yourdomain.com {
     reverse_proxy 127.0.0.1:8080
   }
   ```

   Point a DNS A record for `scanner.yourdomain.com` at the machine, then
   `systemctl reload caddy`. Set `TRUST_PROXY=true` in `.env` so rate limits
   see the caller's address, and `docker compose up -d` again.

`restart: unless-stopped` brings both containers back after a reboot, and
freshclam updates the signatures twelve times a day (`FRESHCLAM_CHECKS`).

### Railway, Render or Fly.io: one container

These run one image per service, so use the single container image, which
runs clamd, freshclam and the API together (`Dockerfile.single`):

- **Railway:** New project, Deploy from GitHub repo, root directory
  `services/file-scanner`, and in Settings set the Dockerfile path to
  `Dockerfile.single`. Add the variable `CLAMAV_SERVICE_SECRET`. Give the
  service 3 GB of memory. Add a volume mounted at `/var/lib/clamav` so a
  restart does not download the signatures again. Settings, Networking,
  Generate Domain gives the https address. Health check path `/health`.
- **Render:** New Web Service from the repo, Runtime Docker, root directory
  `services/file-scanner`, Dockerfile path `./Dockerfile.single`, an instance
  with at least 2 GB (Standard or larger, 4 GB is safer), health check path
  `/health`, environment variable `CLAMAV_SERVICE_SECRET`, and a disk at
  `/var/lib/clamav`. Render gives an `https://…onrender.com` address.
- **Fly.io:** `fly launch --dockerfile Dockerfile.single --no-deploy` in this
  folder, then in `fly.toml` set `internal_port = 8080`, a `[[vm]]` with
  `memory = "3gb"`, and a health check on `/health`. `fly secrets set
  CLAMAV_SERVICE_SECRET=...`, `fly volumes create clamav_db --size 1` mounted at
  `/var/lib/clamav`, then `fly deploy`. Keep one machine always running
  (`min_machines_running = 1`, `auto_stop_machines = false`).

On all three, `TRUST_PROXY=true` is right: they put their own proxy in front.

### Google Cloud Run: possible, with care

Cloud Run works with `Dockerfile.single` but fights ClamAV: set memory to at
least 4 GiB, CPU always allocated, **minimum instances 1** (a cold start
loads the signatures for a minute or more, and a scan waiting for that times
out), a startup probe on `/health` with a long enough window, and
concurrency around 4. Without a volume every new instance starts from the
signatures baked into the image and freshclam updates them in memory; that is
fine as long as instances are replaced now and then. A VPS or Railway is less
work.

## Connect Storelib (switch the engine on)

Storelib reads three variables. The engine is on only when all three are set:

| Variable | Value |
| --- | --- |
| `SECURITY_MALWARE_PROVIDER` | `clamav`. The explicit switch. Unset (the normal state) means Storelib's built-in checks only |
| `CLAMAV_SERVICE_URL` | The scanner's https address, for example `https://scanner.yourdomain.com` (no path, no trailing slash needed) |
| `CLAMAV_SERVICE_SECRET` | The same value as the scanner's `CLAMAV_SERVICE_SECRET` |
| `CLAMAV_SERVICE_MAX_BYTES` | Optional. Keep equal to the scanner's `MAX_FILE_BYTES` if you change it (default 1 GiB) |

In order:

1. Deploy the scanner (above) and open `https://<its address>/health`. It
   should answer `"status":"ok"` (or `degraded` for a few minutes while the
   first signature update runs).
2. Copy that https address.
3. Vercel, the Storelib project, Settings, Environment Variables: add
   `CLAMAV_SERVICE_URL` with the address and `SECURITY_MALWARE_PROVIDER` with
   `clamav`, for **Production**. The secret is already there. Add all three
   to **Preview** too to use it on preview deployments.
4. Redeploy Storelib (Deployments, the latest one, Redeploy), so the new
   variables are read.
5. Open `storelib.com/admin/security`. Under Checks, Malware engine should
   read ClamAV. In Try the check, run the EICAR sample: the built-in checks
   refuse it, and the ClamAV line under the verdict should say infected.

To switch it off again, remove `SECURITY_MALWARE_PROVIDER` (or set it to
`none`) and redeploy. Nothing else changes.

## What Storelib does with each answer

The built-in checks decide the upload while the creator waits (well under a
second). The engine reads the whole file afterwards, in the background
(`lib/security/uploads/pipeline.ts`), so nobody ever waits for it:

| | Product files | Pictures and other public files |
| --- | --- | --- |
| Clean | Recorded on the file | Nothing changes |
| Infected | Deleted from storage, the file is marked blocked, no buyer ever gets it; the creator's editor shows the file was not accepted, in one plain sentence (never the threat's name) | Deleted from storage (its URL stops working) |
| No verdict (scanner down, busy, slow, wrong secret) | Nothing changes: the file already passed the built-in checks. Logged | Nothing changes. Logged |
| Over the scanner's limit | Skipped, logged | Skipped |

Every verdict is logged in `public.file_security_events` (Storelib SQL part
`supabase/sql/run-now/59_file_security_events.sql`) and shown on
`/admin/security`.

## Settings

| Variable | Default | |
| --- | --- | --- |
| `CLAMAV_SERVICE_SECRET` | none, required | At least 32 characters. `openssl rand -hex 32` |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Where the API listens |
| `CLAMD_HOST` / `CLAMD_PORT` | `clamav` / `3310` | clamd over TCP (Compose) |
| `CLAMD_SOCKET` | none | clamd over a unix socket instead (single image: `/tmp/clamd.sock`) |
| `MAX_FILE_BYTES` | `1073741824` (1 GiB) | Keep clamd's `StreamMaxLength` a little above it. ClamAV cannot scan files over 2 GB at all |
| `SCAN_TIMEOUT_MS` | `120000` | First byte to verdict |
| `MAX_CONCURRENT_SCANS` / `MAX_QUEUED_SCANS` / `QUEUE_TIMEOUT_MS` | `4` / `32` / `30000` | Slots sent to clamd at once, and the queue for a slot |
| `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_BURST` | `120` / `30` | Per caller (secret and IP) |
| `AUTH_FAILURES_PER_MINUTE` | `10` | Wrong secrets from one IP before 429 |
| `HEALTH_PER_MINUTE` | `120` | Health checks from one IP |
| `TRUST_PROXY` | `false` | Read the caller's IP from `X-Forwarded-For`. Only behind a proxy you control |
| `MAX_SIGNATURE_AGE_HOURS` | `48` | Older signatures make `/health` say `degraded` |
| `SHUTDOWN_GRACE_MS` | `30000` | How long scans in flight may finish on SIGTERM |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

clamd's own limits are set with the official image's `CLAMD_CONF_*`
variables (see `docker-compose.yml`): `StreamMaxLength`, `MaxFileSize`,
`MaxScanSize`, `MaxThreads`, `ReadTimeout`. `FRESHCLAM_CHECKS` is how many
times a day freshclam looks for new signatures.
