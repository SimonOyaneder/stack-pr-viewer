"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import {
  GitPullRequest,
  RefreshCw,
  Loader2,
  Github,
  LayoutGrid,
  ChevronRight,
  PanelLeft,
  PanelLeftClose,
  LogOut,
  LocateFixed,
  GitPullRequestDraft,
} from "lucide-react"
import { Button } from "./ui/button"
import { Skeleton } from "./ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { Badge } from "./ui/badge"
import { Separator } from "./ui/separator"
import { StackGraph } from "./stack-graph"
import { ThemeMenuItems } from "./mode-toggle"
import { buildStackForest, listStackGroups } from "../lib/stack"
import { getReviewStatus } from "../lib/review-status"
import type { PullRequest } from "../lib/types"
import { cn } from "../lib/utils"
import { toast } from "sonner"

export interface DashboardUser {
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
}

export interface DashboardProps {
  user: DashboardUser
  onSignedOut: () => void
}

const SIDEBAR_STORAGE_KEY = "stack-pr.sidebar-open"

type StatFilter =
  | "all"
  | "stacked"
  | "solo"
  | "open"
  | "draft"
  | "ready"
  | "approved"
  | "pending"
  | "needs_changes"

export function Dashboard({ user, onSignedOut }: DashboardProps) {
  const [prs, setPRs] = useState<PullRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "0"
  })
  const [selectedRoot, setSelectedRoot] = useState<number | "all">("all")
  const [statFilter, setStatFilter] = useState<StatFilter>("all")
  const [relayoutNonce, setRelayoutNonce] = useState(0)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [isSigningOut, startSignOut] = useTransition()

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarOpen ? "1" : "0")
  }, [sidebarOpen])

  const reload = useCallback(
    async (opts?: { silent?: boolean; manual?: boolean }) => {
      const silent = opts?.silent ?? false
      const manual = opts?.manual ?? false
      if (!silent) setIsLoading(true)
      if (manual) setIsManualRefreshing(true)
      try {
        const res = await window.api.prs.list()
        if (!res.ok) {
          if (res.code === "unauthorized") {
            toast.error("Your token is no longer valid", {
              description: "Signing you out…",
            })
            startSignOut(() => {
              void window.api.auth.signOut().then(onSignedOut)
            })
            return
          }
          throw new Error(res.error)
        }
        setPRs((prev) => (samePRSet(prev, res.prs) ? prev : res.prs))
        if (!silent && res.prs.length === 0) {
          toast.message("No open PRs found", {
            description: "Check your token scopes on GitHub.",
          })
        }
      } catch (err) {
        if (!silent) {
          const message = err instanceof Error ? err.message : "Unknown error"
          toast.error("Failed to load PRs", { description: message })
        }
      } finally {
        if (!silent) setIsLoading(false)
        if (manual) setIsManualRefreshing(false)
      }
    },
    [onSignedOut],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const POLL_INTERVAL_MS = 60_000
    const pollIfVisible = () => {
      if (document.visibilityState === "visible") {
        void reload({ silent: true })
      }
    }
    const intervalId = window.setInterval(pollIfVisible, POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reload({ silent: true })
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [reload])

  const forest = useMemo(() => buildStackForest(prs), [prs])
  const groups = useMemo(() => listStackGroups(forest), [forest])

  const filteredPRs = useMemo(() => {
    let result = prs

    if (selectedRoot !== "all") {
      const idSet = new Set<number>()
      const stack = [selectedRoot]
      while (stack.length) {
        const id = stack.pop()!
        idSet.add(id)
        const children = forest.childrenOf.get(id) ?? []
        for (const c of children) stack.push(c)
      }
      result = result.filter((p) => idSet.has(p.id))
    }

    if (statFilter === "open") {
      result = result.filter((p) => p.state === "open" || p.state === "draft")
    } else if (statFilter === "draft") {
      result = result.filter((p) => p.isDraft || p.state === "draft")
    } else if (statFilter === "ready") {
      result = result.filter((p) => p.state === "open" && !p.isDraft)
    } else if (statFilter === "approved") {
      result = result.filter((p) => getReviewStatus(p) === "approved")
    } else if (statFilter === "pending") {
      result = result.filter((p) => getReviewStatus(p) === "pending")
    } else if (statFilter === "needs_changes") {
      result = result.filter((p) => getReviewStatus(p) === "not_approved")
    } else if (statFilter === "stacked") {
      const stackedIds = new Set<number>()
      for (const g of groups) {
        if (g.prIds.length > 1) {
          for (const id of g.prIds) stackedIds.add(id)
        }
      }
      result = result.filter((p) => stackedIds.has(p.id))
    } else if (statFilter === "solo") {
      const soloIds = new Set<number>()
      for (const g of groups) {
        if (g.prIds.length === 1) soloIds.add(g.prIds[0])
      }
      result = result.filter((p) => soloIds.has(p.id))
    }

    return result
  }, [prs, forest, selectedRoot, statFilter, groups])

  const toggleStatFilter = useCallback((filter: StatFilter) => {
    setStatFilter((prev) => (prev === filter ? "all" : filter))
    setRelayoutNonce((n) => n + 1)
  }, [])

  const clearStatFilter = useCallback(() => {
    setStatFilter("all")
    setRelayoutNonce((n) => n + 1)
  }, [])

  const stats = useMemo(() => {
    const stacked = groups.filter((g) => g.prIds.length > 1)
    const stackedPRs = stacked.reduce((sum, g) => sum + g.prIds.length, 0)
    let open = 0
    let draft = 0
    let ready = 0
    let approved = 0
    let pending = 0
    let needsChanges = 0
    for (const pr of prs) {
      if (pr.state === "open" || pr.state === "draft") open++
      if (pr.isDraft || pr.state === "draft") draft++
      else if (pr.state === "open") ready++
      const review = getReviewStatus(pr)
      if (review === "approved") approved++
      else if (review === "pending") pending++
      else if (review === "not_approved") needsChanges++
    }
    return {
      total: prs.length,
      stacks: stacked.length,
      stackedPRs,
      solo: prs.length - stackedPRs,
      open,
      draft,
      ready,
      approved,
      pending,
      needsChanges,
    }
  }, [prs, groups])

  const handleSignOut = useCallback(() => {
    startSignOut(() => {
      void window.api.auth.signOut().then(onSignedOut)
    })
  }, [onSignedOut])

  const handleOpenProfile = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    void window.api.shell.openExternal(user.htmlUrl)
  }, [user.htmlUrl])

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 h-14 flex-shrink-0 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-foreground text-background flex items-center justify-center">
            <GitPullRequest className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">Stack PR</h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
              Your PR dependency tree
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <HeaderStats
            total={stats.open}
            draft={stats.draft}
            ready={stats.ready}
            approved={stats.approved}
            pending={stats.pending}
            needsChanges={stats.needsChanges}
            activeFilter={statFilter}
            onToggle={toggleStatFilter}
            onClear={clearStatFilter}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => void reload({ manual: true })}
            disabled={isManualRefreshing}
            title="Refresh"
          >
            {isManualRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRelayoutNonce((n) => n + 1)}
            title="Recenter layout"
          >
            <LocateFixed className="h-4 w-4" />
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-2 pl-1.5 pr-2.5">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={user.avatarUrl} alt={user.login} />
                  <AvatarFallback className="text-[10px]">
                    {user.login.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium">{user.login}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">
                Signed in as <span className="font-semibold">{user.login}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={user.htmlUrl} onClick={handleOpenProfile}>
                  <Github className="mr-2 h-3.5 w-3.5" />
                  View profile
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Theme
              </DropdownMenuLabel>
              <ThemeMenuItems />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isSigningOut}
                onSelect={(e: Event) => {
                  e.preventDefault()
                  handleSignOut()
                }}
                className="text-red-500 focus:text-red-500"
              >
                <LogOut className="mr-2 h-3.5 w-3.5" />
                {isSigningOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {sidebarOpen && (
        <aside className="w-72 border-r flex-shrink-0 flex flex-col">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Overview
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mr-1"
                onClick={() => setSidebarOpen(false)}
                title="Hide sidebar"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatCard
                label="PRs"
                value={stats.total}
                active={statFilter === "all"}
                onClick={clearStatFilter}
              />
              <StatCard
                label="Stacked"
                value={stats.stackedPRs}
                accent="text-violet-600 dark:text-violet-400"
                active={statFilter === "stacked"}
                onClick={() => toggleStatFilter("stacked")}
              />
              <StatCard
                label="Solo"
                value={stats.solo}
                active={statFilter === "solo"}
                onClick={() => toggleStatFilter("solo")}
              />
              <StatCard
                label="Open"
                value={stats.open}
                active={statFilter === "open"}
                onClick={() => toggleStatFilter("open")}
              />
            </div>
            <div className="mt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                By state
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <StatCard
                  label="Draft"
                  value={stats.draft}
                  accent="text-zinc-600 dark:text-zinc-300"
                  dotClass="bg-zinc-400"
                  active={statFilter === "draft"}
                  onClick={() => toggleStatFilter("draft")}
                />
                <StatCard
                  label="Ready"
                  value={stats.ready}
                  accent="text-sky-600 dark:text-sky-400"
                  dotClass="bg-sky-500"
                  active={statFilter === "ready"}
                  onClick={() => toggleStatFilter("ready")}
                />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                By review status
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <StatCard
                  label="Approved"
                  value={stats.approved}
                  accent="text-emerald-600 dark:text-emerald-400"
                  dotClass="bg-emerald-500"
                  active={statFilter === "approved"}
                  onClick={() => toggleStatFilter("approved")}
                />
                <StatCard
                  label="Pending"
                  value={stats.pending}
                  accent="text-amber-600 dark:text-amber-400"
                  dotClass="bg-amber-500"
                  active={statFilter === "pending"}
                  onClick={() => toggleStatFilter("pending")}
                />
                <StatCard
                  label="Changes"
                  value={stats.needsChanges}
                  accent="text-red-600 dark:text-red-400"
                  dotClass="bg-red-500"
                  active={statFilter === "needs_changes"}
                  onClick={() => toggleStatFilter("needs_changes")}
                />
              </div>
            </div>
          </div>
          <div className="p-3 border-b">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stacks
            </h2>
            <p className="text-[11px] text-muted-foreground mt-1">
              Click to focus a single tree.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <StackListItem
              active={selectedRoot === "all"}
              onClick={() => setSelectedRoot("all")}
              label="All PRs"
              count={prs.length}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
            />
            <Separator className="my-2" />
            {groups.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground text-center py-4">No stacks yet.</p>
            )}
            {isLoading && prs.length === 0 && (
              <div className="space-y-2 p-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            )}
            {groups.map((g) => {
              const root = forest.prsById.get(g.rootId)
              if (!root) return null
              return (
                <StackListItem
                  key={g.rootId}
                  active={selectedRoot === g.rootId}
                  onClick={() => setSelectedRoot(g.rootId)}
                  label={root.title}
                  sublabel={g.repoFullName}
                  count={g.prIds.length}
                  isStack={g.prIds.length > 1}
                />
              )
            })}
          </div>
        </aside>
        )}

        <main className="flex-1 relative min-w-0">
          {!sidebarOpen && (
            <Button
              variant="outline"
              size="icon"
              className="absolute top-3 left-3 h-8 w-8 z-10 shadow-sm"
              onClick={() => setSidebarOpen(true)}
              title="Show sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          {isLoading && prs.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Fetching your PRs from GitHub…</p>
              </div>
            </div>
          ) : filteredPRs.length === 0 ? (
            <EmptyState onRefresh={reload} />
          ) : (
            <StackGraph prs={filteredPRs} direction="TB" relayoutNonce={relayoutNonce} />
          )}
        </main>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  dotClass,
  active,
  onClick,
}: {
  label: string
  value: number
  accent?: string
  dotClass?: string
  active?: boolean
  onClick?: () => void
}) {
  const isClickable = typeof onClick === "function"
  const className = cn(
    "rounded-lg border bg-card/50 px-3 py-2.5 text-left w-full transition-colors",
    isClickable && "hover:bg-card hover:border-foreground/15 cursor-pointer",
    active && "border-foreground/40 bg-accent ring-1 ring-foreground/10",
  )
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
        {dotClass && (
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotClass)} />
        )}
        {label}
      </p>
      <p className={cn("text-2xl font-bold leading-none mt-1.5 tabular-nums", accent)}>
        {value}
      </p>
    </>
  )
  if (!isClickable) {
    return <div className={className}>{content}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={className}
    >
      {content}
    </button>
  )
}

function HeaderStats({
  total,
  draft,
  ready,
  approved,
  pending,
  needsChanges,
  activeFilter,
  onToggle,
  onClear,
}: {
  total: number
  draft: number
  ready: number
  approved: number
  pending: number
  needsChanges: number
  activeFilter: StatFilter
  onToggle: (filter: StatFilter) => void
  onClear: () => void
}) {
  return (
    <div className="hidden sm:flex items-center gap-1 mr-1">
      <button
        type="button"
        onClick={onClear}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-2 py-1 text-[11px] transition-colors cursor-pointer",
          "hover:bg-card hover:border-foreground/15",
        )}
        title="Clear filters"
      >
        <span className="font-semibold tabular-nums">{total}</span>
        <span className="text-muted-foreground">open</span>
      </button>
      <HeaderStatPill
        value={draft}
        icon={<GitPullRequestDraft className="h-3 w-3" />}
        accent="text-zinc-600 dark:text-zinc-300"
        label="Draft"
        active={activeFilter === "draft"}
        onClick={() => onToggle("draft")}
      />
      <HeaderStatPill
        value={ready}
        icon={<GitPullRequest className="h-3 w-3" />}
        accent="text-sky-700 dark:text-sky-400"
        label="Ready for review"
        active={activeFilter === "ready"}
        onClick={() => onToggle("ready")}
      />
      <div className="h-5 w-px bg-border mx-1" />
      <HeaderStatPill
        value={approved}
        dotClass="bg-emerald-500"
        accent="text-emerald-700 dark:text-emerald-400"
        label="Approved"
        active={activeFilter === "approved"}
        onClick={() => onToggle("approved")}
      />
      <HeaderStatPill
        value={pending}
        dotClass="bg-amber-500"
        accent="text-amber-700 dark:text-amber-400"
        label="Pending"
        active={activeFilter === "pending"}
        onClick={() => onToggle("pending")}
      />
      <HeaderStatPill
        value={needsChanges}
        dotClass="bg-red-500"
        accent="text-red-700 dark:text-red-400"
        label="Needs changes"
        active={activeFilter === "needs_changes"}
        onClick={() => onToggle("needs_changes")}
      />
      <div className="h-5 w-px bg-border mx-1" />
    </div>
  )
}

function HeaderStatPill({
  value,
  dotClass,
  icon,
  accent,
  label,
  active,
  onClick,
}: {
  value: number
  dotClass?: string
  icon?: React.ReactNode
  accent: string
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-2 py-1 text-[11px] transition-colors cursor-pointer",
        "hover:bg-card hover:border-foreground/15",
        active && "border-foreground/40 bg-accent ring-1 ring-foreground/10",
      )}
      title={`Filter: ${label} (${value})`}
    >
      {icon ? (
        <span className={cn("flex items-center", accent)}>{icon}</span>
      ) : (
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotClass)} />
      )}
      <span className={cn("font-semibold tabular-nums", accent)}>{value}</span>
    </button>
  )
}

function StackListItem({
  active,
  onClick,
  label,
  sublabel,
  count,
  icon,
  isStack,
}: {
  active: boolean
  onClick: () => void
  label: string
  sublabel?: string
  count: number
  icon?: React.ReactNode
  isStack?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md px-2 py-1.5 transition-colors group cursor-pointer",
        "flex items-start gap-2",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div className="mt-0.5 text-muted-foreground">
        {icon ?? <ChevronRight className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>}
      </div>
      <Badge
        variant="outline"
        className={cn(
          "h-5 text-[10px] px-1.5",
          isStack && "bg-violet-500/10 text-violet-600 border-violet-500/30",
        )}
      >
        {count}
      </Badge>
    </button>
  )
}

function prSignature(p: PullRequest): string {
  return [
    p.updatedAt,
    p.state,
    p.ciStatus,
    p.reviewDecision,
    p.title,
    p.baseRef,
    p.headRef,
    p.reviews.approved,
    p.reviews.changesRequested,
    p.reviews.commented,
    p.reviews.pending,
    p.reviews.requestedReviewers,
    p.comments,
    p.additions,
    p.deletions,
    p.changedFiles,
  ].join("|")
}

function samePRSet(a: PullRequest[], b: PullRequest[]): boolean {
  if (a.length !== b.length) return false
  const prev = new Map(a.map((p) => [p.id, prSignature(p)]))
  return b.every((p) => prev.get(p.id) === prSignature(p))
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <GitPullRequest className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="mt-3 font-semibold">No pull requests yet</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You don&apos;t seem to have any PRs authored. Open one on GitHub or toggle closed PRs.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Refresh
        </Button>
      </div>
    </div>
  )
}
