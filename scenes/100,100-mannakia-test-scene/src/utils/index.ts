export function callPromise<T>(a: () => Promise<T>): () => void {
  return function () {
    a().then().catch(console.error)
  }
}
