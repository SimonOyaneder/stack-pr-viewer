import type { PullRequest, StackEdge, StackForest } from "./types"

export function buildStackForest(prs: PullRequest[]): StackForest {
  const prsById = new Map<number, PullRequest>()
  const byHead = new Map<string, PullRequest>()

  for (const pr of prs) {
    prsById.set(pr.id, pr)
    byHead.set(headKey(pr.repoFullName, pr.headRef), pr)
  }

  const edges: StackEdge[] = []
  const childrenOf = new Map<number, number[]>()
  const hasParent = new Set<number>()

  for (const pr of prs) {
    const parent = byHead.get(headKey(pr.repoFullName, pr.baseRef))
    if (!parent || parent.id === pr.id) continue
    edges.push({ parentId: parent.id, childId: pr.id })
    hasParent.add(pr.id)
    const arr = childrenOf.get(parent.id) ?? []
    arr.push(pr.id)
    childrenOf.set(parent.id, arr)
  }

  const roots = prs.filter((pr) => !hasParent.has(pr.id)).map((pr) => pr.id)

  return { prsById, edges, roots, childrenOf }
}

function headKey(repo: string, branch: string): string {
  return `${repo}@${branch}`
}

export interface StackGroup {
  rootId: number
  repoFullName: string
  prIds: number[]
}

export function listStackGroups(forest: StackForest): StackGroup[] {
  const groups: StackGroup[] = []
  for (const rootId of forest.roots) {
    const root = forest.prsById.get(rootId)
    if (!root) continue
    const prIds: number[] = []
    const stack = [rootId]
    while (stack.length) {
      const id = stack.pop()!
      prIds.push(id)
      const children = forest.childrenOf.get(id) ?? []
      for (const c of children) stack.push(c)
    }
    groups.push({ rootId, repoFullName: root.repoFullName, prIds })
  }
  return groups.sort((a, b) => b.prIds.length - a.prIds.length)
}
