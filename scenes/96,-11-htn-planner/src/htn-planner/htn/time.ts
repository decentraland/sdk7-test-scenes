/** Planning metrics use a monotonic clock where available; the Explorer may provide a Date.now() shim. */
declare const performance: { now(): number } | undefined

export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

/** Seconds tolerance for host cadence and throttling comparisons. */
export const TIME_EPSILON = 1e-6
