/**
 * ===========================================================================
 *  THE SOUND A CALL MAKES
 * ===========================================================================
 *
 * Synthesised rather than a file, for a reason that is not cleverness: a
 * ringtone is a few seconds of two sine waves, and shipping it as an asset
 * means a network fetch between the phone ringing and the phone making a sound.
 * On a slow connection the first ring is silent, which is the one ring that
 * matters. Nothing to load cannot be late.
 *
 * Two sounds, and they are different on purpose:
 *
 *   RING      what the person being called hears. Loud, two-tone, insistent —
 *             it has to be audible from a pocket.
 *
 *   RINGBACK  what the CALLER hears while waiting. Quieter and slower, the
 *             standard European 425Hz burst, because it means "still trying",
 *             not "answer me". Callers who hear their own ringtone played back
 *             at them reach for the phone.
 *
 * Everything runs through one gain node so stopping is a single disconnect
 * rather than chasing oscillators, and the AudioContext is created on demand —
 * constructing one before a user gesture leaves it suspended on iOS.
 */

type Ring = { stop(): void }

const SILENT: Ring = { stop() {} }

function context(): AudioContext | null {
  const Ctx =
    typeof window === "undefined"
      ? null
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  try {
    return new Ctx()
  } catch {
    return null
  }
}

/**
 * @param pattern  seconds of [tone, silence] repeated
 * @param freqs    the tones layered on each burst
 */
function tone(pattern: [number, number], freqs: number[], volume: number): Ring {
  const ctx = context()
  if (!ctx) return SILENT
  // Autoplay policy: a context created outside a gesture starts suspended, and
  // resume() is a no-op rather than an error when it is not needed.
  void ctx.resume().catch(() => undefined)

  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  const oscs = freqs.map((f) => {
    const o = ctx.createOscillator()
    o.type = "sine"
    o.frequency.value = f
    o.connect(master)
    o.start()
    return o
  })

  const [on, off] = pattern
  const cycle = on + off
  let stopped = false

  // Scheduled on the audio clock rather than with setInterval: a timer on the
  // main thread drifts under load and a ringtone that stutters when the phone
  // is busy sounds broken.
  const schedule = (from: number) => {
    if (stopped) return
    for (let i = 0; i < 8; i++) {
      const at = from + i * cycle
      // Ramps rather than steps — a square edge on a sine is an audible click.
      master.gain.setValueAtTime(0, at)
      master.gain.linearRampToValueAtTime(volume, at + 0.04)
      master.gain.setValueAtTime(volume, at + on - 0.04)
      master.gain.linearRampToValueAtTime(0, at + on)
    }
    timer = window.setTimeout(() => schedule(ctx.currentTime + 0.05), cycle * 8 * 1000 - 200)
  }
  let timer = 0
  schedule(ctx.currentTime + 0.05)

  return {
    stop() {
      if (stopped) return
      stopped = true
      window.clearTimeout(timer)
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0, now + 0.06)
      window.setTimeout(() => {
        for (const o of oscs) {
          try {
            o.stop()
          } catch {
            /* already stopped */
          }
        }
        void ctx.close().catch(() => undefined)
      }, 120)
    },
  }
}

/** Somebody is calling you. */
export function playRing(): Ring {
  return tone([1.6, 2.6], [440, 480], 0.22)
}

/** You are calling somebody, and they have not picked up. */
export function playRingback(): Ring {
  return tone([1.0, 3.0], [425], 0.09)
}

/** The short double note that says the other end has picked up. */
export function playConnected(): void {
  const ctx = context()
  if (!ctx) return
  void ctx.resume().catch(() => undefined)
  const g = ctx.createGain()
  g.gain.value = 0
  g.connect(ctx.destination)
  const o = ctx.createOscillator()
  o.type = "sine"
  o.connect(g)
  o.start()
  const t = ctx.currentTime
  for (const [at, f] of [[0, 587.33], [0.11, 880]] as const) {
    o.frequency.setValueAtTime(f, t + at)
    g.gain.setValueAtTime(0, t + at)
    g.gain.linearRampToValueAtTime(0.13, t + at + 0.02)
    g.gain.linearRampToValueAtTime(0, t + at + 0.1)
  }
  window.setTimeout(() => {
    try {
      o.stop()
    } catch {
      /* already stopped */
    }
    void ctx.close().catch(() => undefined)
  }, 400)
}
