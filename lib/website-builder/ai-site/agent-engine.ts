import "server-only"

/**
 * ===========================================================================
 *  WHERE THE AGENT LOOP PLUGS IN (round L)
 * ===========================================================================
 * The runner (./agent-runner.ts) drives a job whose engine is "agent" one
 * iteration at a time through an AgentStepper (lib/ai-builder/agent-step.ts).
 * The loop itself is L3's (lib/ai-builder/agent/*): it registers its factory
 * here. Until it does, an agent job ends at once as "not available" with
 * plain words, and the create route keeps making classic jobs
 * (agentEngineEnabled is false).
 *
 * The switch is the platform's: AI_BUILDER_AGENT=1 in the environment, and
 * a factory registered.
 */
import type { AgentStepperFactory } from "@/lib/ai-builder/agent-step"

let registered: AgentStepperFactory | null = null

/** L3 calls this once at module load of its loop (or a test, with a scripted stepper). */
export function registerAgentStepper(factory: AgentStepperFactory | null): void {
  registered = factory
}

/** The loop's factory, or null when the agent engine is not installed. */
export async function agentStepperFactory(): Promise<AgentStepperFactory | null> {
  return registered
}

/** Whether new Start with AI jobs should use the agent engine. */
export function agentEngineEnabled(): boolean {
  return process.env.AI_BUILDER_AGENT === "1" && registered !== null
}

/** Agent jobs allowed to run at once across every creator. */
export function maxLiveAgentJobs(): number {
  const n = Number(process.env.AI_BUILDER_MAX_LIVE_JOBS)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20
}
