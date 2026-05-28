"use client"

import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Toggle theme">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThemeMenuItems() {
  const { setTheme, theme } = useTheme()
  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setTheme("light")
        }}
        className="gap-2"
      >
        <Sun className="h-3.5 w-3.5" />
        Light
        {theme === "light" && <span className="ml-auto text-[10px] text-muted-foreground">●</span>}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setTheme("dark")
        }}
        className="gap-2"
      >
        <Moon className="h-3.5 w-3.5" />
        Dark
        {theme === "dark" && <span className="ml-auto text-[10px] text-muted-foreground">●</span>}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setTheme("system")
        }}
        className="gap-2"
      >
        <Monitor className="h-3.5 w-3.5" />
        System
        {theme === "system" && <span className="ml-auto text-[10px] text-muted-foreground">●</span>}
      </DropdownMenuItem>
    </>
  )
}
