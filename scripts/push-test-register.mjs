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
