export type PRState = "open" | "draft" | "merged" | "closed"

export type CIStatus = "success" | "failure" | "pending" | "neutral" | "skipped" | "unknown"

export type ReviewDecision = "approved" | "changes_requested" | "review_required" | "none"

export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING"

export interface PRAuthor {
  login: string
  avatarUrl: string
  htmlUrl: string
}

export interface PRReviewsSummary {
  approved: number
  changesRequested: number
  pending: number
  commented: number
  requestedReviewers: number
}

export type ReviewerStateKind =
  | "approved"
  | "changes_requested"
  | "commented"
  | "pending"

export interface ReviewerState {
  login: string
  state: ReviewerStateKind
}

export interface PullRequest {
  id: number
  number: number
  title: string
  state: PRState
  url: string
  repoOwner: string
  repoName: string
  repoFullName: string
  defaultBranch: string
  headRef: string
  baseRef: string
  author: PRAuthor
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  comments: number
  reviewComments: number
  additions: number
  deletions: number
  changedFiles: number
  reviews: PRReviewsSummary
  reviewerStates: ReviewerState[]
  reviewDecision: ReviewDecision
  ciStatus: CIStatus
  isDraft: boolean
  labels: string[]
}
