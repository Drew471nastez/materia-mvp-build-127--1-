/**
 * What everyday Ask Storelib runs cost, measured without a model: model
 * calls, tool calls and estimated input tokens (tests/_ai-quality-v-runs.ts
 * has the runs and how each scripted model decides).
 *
 *   npx tsx scripts/measure-ai-quality-v.ts
 */
import { codeFocusRun, followUpRun } from "../tests/_ai-quality-v-runs"

async function main() {
  for (const run of [codeFocusRun, followUpRun]) {
    const { numbers } = await run()
    console.log(`${numbers.name}: ${numbers.calls} model calls, ${numbers.toolCalls} tool calls, ~${numbers.inputTokens} input tokens, ${numbers.status}`)
  }
}
void main()
