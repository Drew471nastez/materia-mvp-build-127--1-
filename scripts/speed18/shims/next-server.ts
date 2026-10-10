/**
 * next/server for the bench: Next's own request and response classes, and
 * `after()` held by the visit (../context.ts) so its work is counted as
 * work done behind the answer.
 */
// @ts-ignore: Next's own classes, by path
import { NextRequest } from "next/dist/server/web/spec-extension/request.js"
// @ts-ignore: Next's own classes, by path
import { NextResponse } from "next/dist/server/web/spec-extension/response.js"
export { after, connection } from "./next-misc"
export { NextRequest, NextResponse }
