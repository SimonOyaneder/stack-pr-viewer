import { useCallback, useEffect, useState } from "react"
import { Dashboard, type DashboardUser } from "../components/dashboard"
import { LoginScreen } from "../components/login-screen"

type AuthStatus = "loading" | "ready"

export default function Home() {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")

  const refreshViewer = useCallback(async () => {
    try {
      const res = await window.api.auth.getViewer()
      setUser(res.user)
    } catch {
      setUser(null)
    } finally {
      setStatus("ready")
    }
  }, [])

  useEffect(() => {
    void refreshViewer()
  }, [refreshViewer])

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onSignedIn={(u) => setUser(u)} />
  }

  return (
    <Dashboard
      user={user}
      onSignedOut={() => setUser(null)}
    />
  )
}
