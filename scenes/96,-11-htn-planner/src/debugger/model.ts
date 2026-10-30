// What the graph layout draws: an AND/OR graph (a task decomposition graph). A method is an OR node (`task`: pick
// one branch), a branch an AND node (do its tasks in order) with its precondition chips, primitives are leaves.
// Built from the library's DomainGraph by domain-focus.ts; laid out by graph-layout.ts. Pure.

export type GraphNodeKind = 'task' | 'branch' | 'primitive'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** Precondition chips of a branch. */
  chips?: string[]
}

export interface GraphEdge {
  from: string
  to: string
}

export interface GraphModel {
  root: string
  nodes: GraphNode[]
  /** Method → its branches in priority order; branch → its tasks in order. */
  edges: GraphEdge[]
}
