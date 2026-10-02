// Milliseconds since the feedback module was loaded, for startup timing logs.
const loadedAt = Date.now()

export function sinceLoad(): string {
  return `${Date.now() - loadedAt} ms`
}
