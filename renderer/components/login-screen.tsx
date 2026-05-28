"use client"

import { useId, useState } from "react"
import {
  AlertCircle,
  ExternalLink,
  Eye,
  Github,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { Button } from "./ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Separator } from "./ui/separator"
import { ModeToggle } from "./mode-toggle"
import type { DashboardUser } from "./dashboard"

const PAT_DEEP_LINK =
  "https://github.com/settings/tokens/new?scopes=repo,read:org,read:user&description=Stack%20PR"

export interface LoginScreenProps {
  onSignedIn: (user: DashboardUser) => void
}

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const inputId = useId()
  const [token, setToken] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await window.api.auth.signIn(token)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSignedIn(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.")
    } finally {
      setPending(false)
    }
  }

  const openPatLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    void window.api.shell.openExternal(PAT_DEEP_LINK)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center">
              <Github className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Stack PR</CardTitle>
            <CardDescription>
              Visualize your GitHub PR stacks as a live dependency tree.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={inputId} className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  GitHub Personal Access Token
                </Label>
                <Input
                  id={inputId}
                  name="token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ghp_…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={pending}
                  aria-invalid={error ? true : undefined}
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={pending || !token.trim()}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating with GitHub…
                  </>
                ) : (
                  <>
                    <Github className="mr-2 h-4 w-4" />
                    Continue
                  </>
                )}
              </Button>
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </form>

            <Button asChild variant="outline" className="w-full">
              <a href={PAT_DEEP_LINK} onClick={openPatLink}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Generate a token on github.com
              </a>
            </Button>

            <Separator />

            <div className="space-y-3 text-xs text-muted-foreground">
              <div>
                <p className="font-medium text-foreground mb-1">Required scopes</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5">repo</code> — read your PRs
                    (public + private)
                  </li>
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5">read:org</code> — list PRs in
                    organization repos
                  </li>
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5">read:user</code> — identify
                    your account
                  </li>
                </ul>
              </div>
              <p className="flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                Stored encrypted in your OS keychain (Keychain / DPAPI / libsecret). Never exposed
                to the renderer process.
              </p>
              <p className="flex items-start gap-2">
                <Eye className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                Used only to call <code className="rounded bg-muted px-1 py-0.5">api.github.com</code> from the main process.
              </p>
            </div>
          </CardContent>
          <CardFooter className="text-[11px] text-muted-foreground justify-center">
            For SAML SSO orgs: after creating the PAT, click &quot;Configure SSO&quot; next to the token
            and authorize each org.
          </CardFooter>
        </Card>
      </div>
      <footer className="px-4 py-3 text-center text-[11px] text-muted-foreground">
        Powered by Electron · Next.js · shadcn/ui · React Flow
      </footer>
    </div>
  )
}
