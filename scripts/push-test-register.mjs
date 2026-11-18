/**
 * Registers scripts/push-test-loader.mjs. Passed to node as `--import`.
 *
 * A file rather than a `data:` URL because the loader has to be named by an
 * absolute URL and building one inside a command-line string is unreadable and
 * quoting-dependent.
 */
import { register } from "node:module"
import { pathToFileURL } from "node:url"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

register(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "push-test-loader.mjs")).href)

/* A refund email waits twenty seconds for the other refunds of the same press (lib/physical/jobs-server.ts
   queueRefundEmail). Suites run their job queue at once, so here it does not wait; the suite that measures the
   pause sets its own. */
if (process.env.STORELIB_REFUND_EMAIL_SETTLE_MS === undefined) process.env.STORELIB_REFUND_EMAIL_SETTLE_MS = "0"
