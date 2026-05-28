import type { PullRequest } from "./types"

export type ReviewStatus = "not_approved" | "pending" | "approved" | "none"

export function getReviewStatus(pr: PullRequest): ReviewStatus {
  if (pr.state !== "open" && pr.state !== "draft") return "none"

  if (pr.reviewDecision === "approved") return "approved"
  if (pr.reviewDecision === "changes_requested") return "not_approved"

  const kinds = new Set(pr.reviewerStates.map((r) => r.state))
  if (kinds.has("pending")) return "pending"
  if (kinds.has("changes_requested") || kinds.has("commented")) return "not_approved"
  if (kinds.has("approved")) return "approved"
  if (pr.reviewDecision === "review_required") return "pending"
  return "none"
}

const STATE_COLOR: Record<PullRequest["state"], string> = {
  open: "#10b981",
  draft: "#a1a1aa",
  merged: "#8b5cf6",
  closed: "#ef4444",
}

const REVIEW_COLOR: Record<Exclude<ReviewStatus, "none">, string> = {
  not_approved: "#ef4444",
  pending: "#f59e0b",
  approved: "#10b981",
}

export function prAccentColor(pr: PullRequest): string {
  const review = getReviewStatus(pr)
  if (review !== "none") return REVIEW_COLOR[review]
  return STATE_COLOR[pr.state]
}
