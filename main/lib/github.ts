import type {
  CIStatus,
  PRState,
  PullRequest,
  ReviewDecision,
  ReviewerState,
  ReviewState,
} from "./types"

const GITHUB_API = "https://api.github.com"
const USER_AGENT = "stack-pr-viewer"

const EXCLUDED_REVIEWER_LOGINS = new Set<string>([
  "rubotina-ci",
  "github-actions",
  "github-actions[bot]",
])

function isExcludedReviewer(typename: string | undefined, login: string | undefined): boolean {
  if (!login) return true
  if (typename === "Bot") return true
  return EXCLUDED_REVIEWER_LOGINS.has(login)
}

export interface GitHubUser {
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
}

export class GitHubAuthError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "GitHubAuthError"
    this.status = status
  }
}

interface GhUserResponse {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

export async function fetchViewer(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, { headers: authHeaders(token) })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    if (res.status === 401) {
      throw new GitHubAuthError("Bad credentials", 401)
    }
    throw new Error(`GitHub ${res.status}: ${body || res.statusText}`)
  }
  const data = (await res.json()) as GhUserResponse
  return {
    login: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url,
    htmlUrl: data.html_url,
  }
}

interface GqlSearchResponse {
  search: {
    issueCount: number
    nodes: GqlPullRequest[]
  }
}

interface GqlPullRequest {
  id: string
  databaseId: number
  number: number
  title: string
  url: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  additions: number
  deletions: number
  changedFiles: number
  baseRefName: string
  headRefName: string
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
  comments: { totalCount: number }
  reviewThreads?: { totalCount: number }
  repository: {
    name: string
    nameWithOwner: string
    owner: { login: string }
    defaultBranchRef: { name: string } | null
  }
  author: { login: string; avatarUrl: string; url?: string } | null
  reviews: {
    nodes: {
      state: ReviewState
      submittedAt: string | null
      author: { __typename: string; login: string } | null
    }[]
  }
  reviewRequests: {
    totalCount: number
    nodes: {
      requestedReviewer: {
        __typename: string
        login?: string
        name?: string
      } | null
    }[]
  }
  labels: { nodes: { name: string }[] }
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: { state: string } | null
      }
    }[]
  }
}

const PR_SEARCH_QUERY = `
  query SearchAuthoredPRs($q: String!, $first: Int!) {
    search(query: $q, type: ISSUE, first: $first) {
      issueCount
      nodes {
        ... on PullRequest {
          id
          databaseId
          number
          title
          url
          state
          isDraft
          createdAt
          updatedAt
          mergedAt
          additions
          deletions
          changedFiles
          baseRefName
          headRefName
          reviewDecision
          comments { totalCount }
          repository {
            name
            nameWithOwner
            owner { login }
            defaultBranchRef { name }
          }
          author {
            login
            avatarUrl
            ... on User { url }
          }
          reviews(first: 100) {
            nodes {
              state
              submittedAt
              author {
                __typename
                login
              }
            }
          }
          reviewRequests(first: 50) {
            totalCount
            nodes {
              requestedReviewer {
                __typename
                ... on User { login }
                ... on Bot { login }
                ... on Team { name }
              }
            }
          }
          labels(first: 20) { nodes { name } }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup { state }
              }
            }
          }
        }
      }
    }
  }
`

interface GraphqlEnvelope<T> {
  data?: T
  errors?: Array<{ message: string; path?: (string | number)[] }>
}

async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T; errors: GraphqlEnvelope<T>["errors"] }> {
  const maxAttempts = 3
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 401) {
      throw new GitHubAuthError("Bad credentials", 401)
    }
    if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
      const delayMs = 400 * 2 ** (attempt - 1)
      await new Promise((r) => setTimeout(r, delayMs))
      lastError = new Error(`GitHub GraphQL ${res.status}`)
      continue
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`GitHub GraphQL ${res.status}: ${body || res.statusText}`)
    }
    const envelope = (await res.json()) as GraphqlEnvelope<T>
    if (!envelope.data) {
      const msg = envelope.errors?.[0]?.message ?? "Empty GraphQL response"
      throw new Error(`GitHub GraphQL error: ${msg}`)
    }
    return { data: envelope.data, errors: envelope.errors }
  }
  throw lastError instanceof Error ? lastError : new Error("GitHub GraphQL failed")
}

function mapState(state: GqlPullRequest["state"], isDraft: boolean): PRState {
  if (state === "MERGED") return "merged"
  if (state === "CLOSED") return "closed"
  return isDraft ? "draft" : "open"
}

function mapReviewDecision(raw: GqlPullRequest["reviewDecision"]): ReviewDecision {
  switch (raw) {
    case "APPROVED":
      return "approved"
    case "CHANGES_REQUESTED":
      return "changes_requested"
    case "REVIEW_REQUIRED":
      return "review_required"
    default:
      return "none"
  }
}

function mapCIStatus(raw: string | null | undefined): CIStatus {
  switch (raw) {
    case "SUCCESS":
      return "success"
    case "FAILURE":
    case "ERROR":
      return "failure"
    case "PENDING":
    case "EXPECTED":
      return "pending"
    case "NEUTRAL":
      return "neutral"
    case "SKIPPED":
      return "skipped"
    default:
      return "unknown"
  }
}

function computeReviewerStates(node: GqlPullRequest): ReviewerState[] {
  const authorLogin = node.author?.login ?? null
  const latestByLogin = new Map<string, ReviewerState>()
  const reviews = [...(node.reviews?.nodes ?? [])].sort((a, b) => {
    const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
    const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
    return ta - tb
  })

  for (const r of reviews) {
    const login = r.author?.login
    if (isExcludedReviewer(r.author?.__typename, login)) continue
    if (login === authorLogin) continue
    if (r.state === "DISMISSED") {
      latestByLogin.delete(login!)
      continue
    }
    const state: ReviewerState["state"] | null =
      r.state === "APPROVED"
        ? "approved"
        : r.state === "CHANGES_REQUESTED"
          ? "changes_requested"
          : r.state === "COMMENTED"
            ? "commented"
            : null
    if (!state) continue
    latestByLogin.set(login!, { login: login!, state })
  }

  for (const req of node.reviewRequests?.nodes ?? []) {
    const reviewer = req.requestedReviewer
    if (!reviewer) continue
    if (reviewer.__typename === "Team") continue
    const login = reviewer.login
    if (isExcludedReviewer(reviewer.__typename, login)) continue
    if (login === authorLogin) continue
    latestByLogin.set(login!, { login: login!, state: "pending" })
  }

  return [...latestByLogin.values()]
}

function summarizeReviewerStates(states: ReviewerState[]): PullRequest["reviews"] {
  const summary = {
    approved: 0,
    changesRequested: 0,
    pending: 0,
    commented: 0,
    requestedReviewers: 0,
  }
  for (const r of states) {
    switch (r.state) {
      case "approved":
        summary.approved++
        break
      case "changes_requested":
        summary.changesRequested++
        break
      case "commented":
        summary.commented++
        break
      case "pending":
        summary.pending++
        summary.requestedReviewers++
        break
    }
  }
  return summary
}

function normalizePR(node: GqlPullRequest): PullRequest | null {
  try {
    const reviewerStates = computeReviewerStates(node)
    const reviews = summarizeReviewerStates(reviewerStates)
    const ciRaw = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
    return {
      id: node.databaseId,
      number: node.number,
      title: node.title,
      state: mapState(node.state, node.isDraft),
      url: node.url,
      repoOwner: node.repository?.owner?.login ?? "unknown",
      repoName: node.repository?.name ?? "unknown",
      repoFullName: node.repository?.nameWithOwner ?? "unknown/unknown",
      defaultBranch: node.repository?.defaultBranchRef?.name ?? "main",
      headRef: node.headRefName,
      baseRef: node.baseRefName,
      author: {
        login: node.author?.login ?? "ghost",
        avatarUrl: node.author?.avatarUrl ?? "",
        htmlUrl: node.author?.url ?? "",
      },
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      mergedAt: node.mergedAt,
      comments: node.comments?.totalCount ?? 0,
      reviewComments: 0,
      additions: node.additions,
      deletions: node.deletions,
      changedFiles: node.changedFiles,
      reviews,
      reviewerStates,
      reviewDecision: mapReviewDecision(node.reviewDecision),
      ciStatus: mapCIStatus(ciRaw),
      isDraft: node.isDraft,
      labels: node.labels?.nodes?.map((l) => l.name) ?? [],
    }
  } catch (err) {
    console.error("normalizePR failed for node", { number: node?.number, err })
    return null
  }
}

export interface FetchPRsOptions {
  limit?: number
}

export async function fetchAuthoredPRs(
  token: string,
  viewer: string,
  opts: FetchPRsOptions = {},
): Promise<PullRequest[]> {
  const limit = Math.min(opts.limit ?? 100, 100)
  const q = `is:pr author:${viewer} is:open sort:updated-desc`
  const { data, errors } = await githubGraphql<GqlSearchResponse>(token, PR_SEARCH_QUERY, {
    q,
    first: limit,
  })
  if (errors?.length) {
    console.warn("[fetchAuthoredPRs] GraphQL returned errors alongside data", {
      errorCount: errors.length,
      firstError: errors[0]?.message,
    })
  }
  return data.search.nodes
    .filter(Boolean)
    .map(normalizePR)
    .filter((pr): pr is PullRequest => pr !== null)
}
