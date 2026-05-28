import dagre from "@dagrejs/dagre"
import { Position, type Edge, type Node } from "@xyflow/react"

export type LayoutDirection = "TB" | "BT" | "LR" | "RL"

export interface LayoutOptions {
  direction?: LayoutDirection
  nodeWidth?: number
  nodeHeight?: number
  rankSep?: number
  nodeSep?: number
}

function getHandlePositions(direction: LayoutDirection) {
  switch (direction) {
    case "TB":
      return { source: Position.Bottom, target: Position.Top }
    case "BT":
      return { source: Position.Top, target: Position.Bottom }
    case "LR":
      return { source: Position.Right, target: Position.Left }
    case "RL":
      return { source: Position.Left, target: Position.Right }
  }
}

export function layoutGraph<NodeData extends Record<string, unknown>>(
  nodes: Node<NodeData>[],
  edges: Edge[],
  opts: LayoutOptions = {},
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const direction = opts.direction ?? "TB"
  const nodeWidth = opts.nodeWidth ?? 320
  const nodeHeight = opts.nodeHeight ?? 200
  const handles = getHandlePositions(direction)

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    ranksep: opts.rankSep ?? 90,
    nodesep: opts.nodeSep ?? 50,
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const laidOut: Node<NodeData>[] = nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      targetPosition: handles.target,
      sourcePosition: handles.source,
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: laidOut, edges }
}
