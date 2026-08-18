// A single test's verdict for ONE side (client or server). `pass` answers the
// test's one claim; `detail` has to carry the evidence, because the panel shows
// nothing else — on an unsupported server it is the only place the reader learns
// *which* component never arrived.
export interface TestOutcome {
  pass: boolean
  detail: string
}

// Tests take no arguments: they build their own rig, assert, and clean it up.
// The identical function is what the server runs and what the client runs.
export type TestFn = () => Promise<TestOutcome>
