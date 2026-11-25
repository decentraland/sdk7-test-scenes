export type LiveRecipeResult = {
  status: 'pass' | 'fail'
  detail: string
  metrics?: Readonly<Record<string, number>>
}

export type LiveRecipeAction = {
  label: string
  run: () => void
}

export type LiveRecipe = {
  id: string
  label: string
  mount(
    onResult: (result: LiveRecipeResult) => void,
    setAction: (action: LiveRecipeAction | undefined) => void
  ): () => void
}
