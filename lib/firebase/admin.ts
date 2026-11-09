import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getMessaging, type Messaging } from "firebase-admin/messaging"

/**
 * Firebase Admin SDK singleton.
 * Server-only — never import in client components.
 *
 * Env vars required:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (newlines escaped as \n in Vercel, unescaped here)
 *
 * Initialised on FIRST USE rather than on import, and that is the whole point
 * of this file's shape. Credentials read at module scope run during the build's
 * page-data collection, where none of these variables exist — so a missing push
 * key failed the entire build, on routes that merely imported something that
 * imported this. Worse, the failure was `Cannot read properties of undefined
 * (reading 'replace')`, which names neither the variable nor the file.
 *
 * Deferring it means a deploy without push configured builds and runs, and only
 * the code path that actually sends a notification notices — which it reports
 * by name.
 */
/*
  THE TWO PARTS STORELIB USES, NOT THE WHOLE SDK (round 52). The default
  `import admin from "firebase-admin"` is the namespace, whose getters require
  Firestore, Storage and the Realtime Database (google-gax, gRPC, protobufjs):
  862 files the build parsed and traced for every route that reaches the push
  sender, which is most of them, though only messaging is ever called.
  firebase-admin/app and firebase-admin/messaging are the same SDK and the same
  app store (148 files), and the namespace's app.messaging() is exactly
  getMessaging(app) (firebase-admin/lib/app/firebase-namespace.js).
  Measured on a cold `pnpm build` on 4 CPUs: the build's peak fell from 7.99 GB
  to 7.66 GB in the Next process (8.35 GB to 7.97 GB for the whole build) and the
  compile from 2.5 to 2.1 minutes. Same routes, same pages; each function ships
  without the Firestore, Storage and Database files nothing here loads.
*/
export type FirebaseAdmin = { app: App; messaging(): Messaging }

let app: FirebaseAdmin | null = null

const withMessaging = (a: App): FirebaseAdmin => ({ app: a, messaging: () => getMessaging(a) })

export function getFirebaseAdmin(): FirebaseAdmin | null {
  if (app) return app
  const existing = getApps()[0]
  if (existing) {
    app = withMessaging(existing)
    return app
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (!projectId || !clientEmail || !privateKey) {
    /* Said once per instance, not once per notification. */
    if (!said) console.warn("[firebase] Push to phones is off: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY")
    said = true
    return null
  }

  try {
    app = withMessaging(initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // Vercel stores the key on one line with literal \n sequences.
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    }))
  } catch (e) {
    /* A key that does not parse: phones are skipped, the sale is not. */
    if (!said) console.warn(`[firebase] Push to phones is off: the FIREBASE_* credentials were refused (${e instanceof Error ? e.message.slice(0, 120) : "unknown"})`)
    said = true
    return null
  }
  return app
}

let said = false
