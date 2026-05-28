"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  CheckCircle2,
  Circle,
  CircleDot,
  GitMerge,
  GitPullRequest,
  GitPullRequestDraft,
  XCircle,
  MessageSquare,
  Plus,
  Minus,
  FileDiff,
  Clock,
} from "lucide-react"
import { cn } from "../lib/utils"
import { getReviewStatus, type ReviewStatus } from "../lib/review-status"
import type { CIStatus, PRState, PullRequest } from "../lib/types"

export interface PRNodeData extends Record<string, unknown> {
  pr: PullRequest
}

const reviewStatusConfig: Record<
  ReviewStatus,
  { ring: string; label: string; dot: string }
> = {
  not_approved: {
    ring: "ring-2 ring-red-500/70",
    label: "Not approved — needs action",
    dot: "bg-red-500",
  },
  pending: {
    ring: "ring-2 ring-amber-500/60",
    label: "Awaiting review",
    dot: "bg-amber-500",
  },
  approved: {
    ring: "ring-2 ring-emerald-500/60",
    label: "Approved",
    dot: "bg-emerald-500",
  },
  none: { ring: "", label: "", dot: "" },
}

const stateConfig: Record<
  PRState,
  {
    label: string
    Icon: typeof GitPullRequest
    ring: string
    pill: string
    iconColor: string
  }
> = {
  open: {
    label: "Open",
    Icon: GitPullRequest,
    ring: "ring-emerald-500/30",
    pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    iconColor: "text-emerald-500",
  },
  draft: {
    label: "Draft",
    Icon: GitPullRequestDraft,
    ring: "ring-zinc-400/30",
    pill: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
    iconColor: "text-zinc-400",
  },
  merged: {
    label: "Merged",
    Icon: GitMerge,
    ring: "ring-violet-500/30",
    pill: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/30",
    iconColor: "text-violet-500",
  },
  closed: {
    label: "Closed",
    Icon: XCircle,
    ring: "ring-red-500/30",
    pill: "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/30",
    iconColor: "text-red-500",
  },
}

function CIBadge({ status }: { status: CIStatus }) {
  const map: Record<
    CIStatus,
    { Icon: typeof Circle; cls: string; label: string }
  > = {
    success: { Icon: CheckCircle2, cls: "text-emerald-500", label: "Passing" },
    failure: { Icon: XCircle, cls: "text-red-500", label: "Failing" },
    pending: { Icon: CircleDot, cls: "text-amber-500 animate-pulse", label: "Running" },
    neutral: { Icon: Circle, cls: "text-zinc-400", label: "Neutral" },
    skipped: { Icon: Circle, cls: "text-zinc-400", label: "Skipped" },
    unknown: { Icon: Circle, cls: "text-zinc-400/60", label: "No checks" },
  }
  const { Icon, cls, label } = map[status]
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
      title={`CI: ${label}`}
    >
      <Icon className={cn("h-3.5 w-3.5", cls)} />
      {label}
    </span>
  )
}

function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  return `${months}mo ago`
}

export function PRNode({ data }: NodeProps & { data: PRNodeData }) {
  const { pr } = data
  const config = stateConfig[pr.state]
  const { Icon } = config
  const reviewStatus = getReviewStatus(pr)
  const reviewCfg = reviewStatusConfig[reviewStatus]

  function open(e: React.MouseEvent) {
    e.stopPropagation()
    void window.api.shell.openExternal(pr.url)
  }

  return (
    <div
      onClick={open}
      className={cn(
        "group relative w-[320px] cursor-pointer select-none rounded-xl border bg-card text-card-foreground",
        "shadow-sm transition-all duration-150",
        "hover:shadow-lg hover:-translate-y-0.5 hover:border-foreground/20",
        reviewStatus === "none" ? cn("ring-1", config.ring) : reviewCfg.ring,
      )}
      title={reviewStatus !== "none" ? reviewCfg.label : undefined}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
        isConnectable={false}
      />

      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
            <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", config.iconColor)} />
            <span className="truncate font-medium">{pr.repoFullName}</span>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide flex-shrink-0",
              config.pill,
            )}
          >
            {config.label}
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-foreground transition-colors">
            <span className="text-muted-foreground font-normal mr-1">#{pr.number}</span>
            {pr.title}
          </h3>
        </div>

        <div className="text-[10.5px] text-muted-foreground flex items-center gap-1.5 overflow-hidden">
          <code className="rounded bg-muted px-1.5 py-0.5 truncate max-w-[45%]">
            {pr.baseRef}
          </code>
          <span className="text-muted-foreground/60">←</span>
          <code className="rounded bg-muted px-1.5 py-0.5 truncate max-w-[45%]">
            {pr.headRef}
          </code>
        </div>

        {(pr.reviews.changesRequested > 0 ||
          pr.reviews.commented > 0 ||
          pr.reviews.approved > 0 ||
          pr.reviews.requestedReviewers > 0) && (
          <div className="flex items-center gap-1 flex-wrap">
            {pr.reviews.changesRequested > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-red-500/15 border border-red-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400"
                title="Changes requested — needs work"
              >
                ✕ {pr.reviews.changesRequested} changes
              </span>
            )}
            {pr.reviews.commented > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-sky-500/15 border border-sky-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400"
                title="Has comments — go discuss"
              >
                💬 {pr.reviews.commented} commented
              </span>
            )}
            {pr.reviews.approved > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/12 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                title="Approved"
              >
                ✓ {pr.reviews.approved} approved
              </span>
            )}
            {pr.reviews.requestedReviewers > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                title="Awaiting review"
              >
                ⏳ {pr.reviews.requestedReviewers} pending
              </span>
            )}
          </div>
        )}

        <div className="border-t border-border/60" />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <CIBadge status={pr.ciStatus} />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5" title="Comments">
              <MessageSquare className="h-3 w-3" />
              {pr.comments}
            </span>
            <span
              className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
              title="Additions"
            >
              <Plus className="h-3 w-3" />
              {pr.additions}
            </span>
            <span
              className="inline-flex items-center gap-0.5 text-red-500 dark:text-red-400"
              title="Deletions"
            >
              <Minus className="h-3 w-3" />
              {pr.deletions}
            </span>
            <span className="inline-flex items-center gap-0.5" title="Files changed">
              <FileDiff className="h-3 w-3" />
              {pr.changedFiles}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {pr.author.avatarUrl && (
              <img
                src={pr.author.avatarUrl}
                alt={pr.author.login}
                className="h-4 w-4 rounded-full"
                loading="lazy"
              />
            )}
            <span className="font-medium">{pr.author.login}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelative(pr.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}
