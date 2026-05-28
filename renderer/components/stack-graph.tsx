"use client"

import { useMemo, useEffect, useRef } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { PRNode, type PRNodeData } from "@/components/pr-node"
import { layoutGraph, type LayoutDirection } from "@/lib/layout"
import { prAccentColor } from "@/lib/review-status"
import { buildStackForest } from "@/lib/stack"
import type { PullRequest } from "@/lib/types"

const nodeTypes = { pr: PRNode }

interface StackGraphInnerProps {
  prs: PullRequest[]
  direction: LayoutDirection
  relayoutNonce?: number
}

function StackGraphInner({ prs, direction, relayoutNonce = 0 }: StackGraphInnerProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const forest = buildStackForest(prs)
    const nodes: Node<PRNodeData>[] = prs.map((pr) => ({
      id: String(pr.id),
      type: "pr",
      position: { x: 0, y: 0 },
      data: { pr },
    }))
    const edges: Edge[] = forest.edges.map((e) => ({
      id: `${e.parentId}->${e.childId}`,
      source: String(e.parentId),
      target: String(e.childId),
      type: "smoothstep",
      animated: true,
      style: { stroke: "var(--edge-color)", strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--edge-color)",
        width: 20,
        height: 20,
      },
    }))
    const laid = layoutGraph<PRNodeData>(nodes, edges, { direction })
    return { initialNodes: laid.nodes, initialEdges: laid.edges }
  }, [prs, direction, relayoutNonce])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PRNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges)
  const { fitView } = useReactFlow()
  const prevDirectionRef = useRef(direction)
  const prevNonceRef = useRef(relayoutNonce)

  useEffect(() => {
    const directionChanged = prevDirectionRef.current !== direction
    const nonceChanged = prevNonceRef.current !== relayoutNonce
    const forceRelayout = directionChanged || nonceChanged

    setNodes((current) => {
      if (forceRelayout) return initialNodes
      const byId = new Map(current.map((n) => [n.id, n]))
      return initialNodes.map((n) => {
        const prev = byId.get(n.id)
        return prev ? { ...prev, data: n.data } : n
      })
    })
    setEdges(initialEdges)
    if (forceRelayout) {
      prevDirectionRef.current = direction
      prevNonceRef.current = relayoutNonce
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }))
    }
  }, [initialNodes, initialEdges, direction, relayoutNonce, setNodes, setEdges, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={1.5}
      colorMode="system"
    >
      <Background gap={20} size={1} className="!bg-background" />
      <Controls
        position="bottom-right"
        showInteractive={false}
        className="!rounded-lg !overflow-hidden !shadow-md"
      />
      <MiniMap
        position="top-right"
        pannable
        zoomable
        nodeStrokeWidth={3}
        maskColor="var(--minimap-mask)"
        bgColor="var(--card)"
        nodeColor={(node) => {
          const pr = (node.data as PRNodeData | undefined)?.pr
          if (!pr) return "#888"
          return prAccentColor(pr)
        }}
      />
    </ReactFlow>
  )
}

export interface StackGraphProps {
  prs: PullRequest[]
  direction?: LayoutDirection
  relayoutNonce?: number
}

export function StackGraph({ prs, direction = "TB", relayoutNonce }: StackGraphProps) {
  return (
    <ReactFlowProvider>
      <StackGraphInner prs={prs} direction={direction} relayoutNonce={relayoutNonce} />
    </ReactFlowProvider>
  )
}
