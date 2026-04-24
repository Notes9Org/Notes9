"use client"

import { useState, useEffect } from "react"
import { CircleHelp, Menu, Moon, Sun, Search, Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"

import { Notes9Brand } from "@/components/brand/notes9-brand"
import { APP_PRIMARY_NAV } from "@/lib/app-primary-nav"
import { isNavActive, previewRouteForHref } from "@/lib/marketing/preview-href-map"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import type { PreviewRouteId, PreviewSessionFlags } from "@/lib/marketing/preview-workflow"
import type { PreviewAction } from "./preview-reducer"
import { routeBreadcrumb } from "./preview-panels"
import { MarketingPreviewAiRail } from "./preview-ai-rail"
import { startMarketingPreviewTour, destroyPreviewTourDriver, subscribePreviewTourStart } from "./preview-tour"

type Msg = { role: "user" | "assistant"; text: string }

function PreviewHeaderBar({
  previewRoute,
  onStartTour,
  aiOpen,
  onToggleAi,
}: {
  previewRoute: PreviewRouteId
  onStartTour: () => void
  aiOpen: boolean
  onToggleAi: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { isMobile, setOpenMobile } = useSidebar()

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <header
      data-tour="preview-app-header"
      className="flex h-12 shrink-0 items-center justify-between border-b border-border/45 bg-[var(--n9-header-bg)] px-2 backdrop-blur-md sm:h-14 sm:px-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isMobile ? (
          <Button
            data-sidebar="trigger"
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => setOpenMobile(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 truncate pr-1 text-left text-sm text-muted-foreground" title={routeBreadcrumb(previewRoute)}>
          {routeBreadcrumb(previewRoute)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 sm:size-9 text-muted-foreground hover:text-foreground"
          onClick={onStartTour}
          aria-label="Start guided tour"
          title="Start guided tour"
        >
          <CircleHelp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 sm:size-9"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label={mounted && resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {!mounted ? <Moon className="size-4" /> : resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button
          id="tour-preview-ai-toggle"
          type="button"
          variant={aiOpen ? "secondary" : "ghost"}
          size="icon"
          className="size-8 sm:size-9"
          onClick={onToggleAi}
          aria-label={aiOpen ? "Hide assistant panel" : "Open assistant panel"}
          title={aiOpen ? "Hide assistant" : "Open assistant (preview)"}
        >
          <Sparkles className="size-4" />
        </Button>
      </div>
    </header>
  )
}

function PreviewSidebarNav({
  previewRoute,
  dispatch,
}: {
  previewRoute: PreviewRouteId
  dispatch: (a: PreviewAction) => void
}) {
  const { setOpenMobile, open, isMobile, setOpen } = useSidebar()
  const isIconMode = !open

  const toggleSidebarOpen = () => {
    setOpen(!open)
  }

  return (
    <Sidebar
      data-tour="preview-app-sidebar"
      variant="sidebar"
      collapsible="icon"
      className="!h-full min-h-0 !max-h-full shrink-0 shadow-[2px_0_18px_-16px_rgba(44,36,24,0.22)] dark:shadow-[2px_0_18px_-16px_rgba(0,0,0,0.45)]"
    >
      <SidebarHeader
        className={cn("shrink-0 p-2", isIconMode && "gap-1 pb-1 pt-1.5")}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            {isIconMode ? (
              <div className="flex w-full flex-col items-center gap-1">
                <SidebarMenuButton size="lg" type="button" className="h-9 w-9 p-0 [&>span]:hidden">
                  <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                    <Image
                      src="/notes9-logo-mark-transparent.png"
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 object-contain dark:invert dark:brightness-125"
                    />
                  </div>
                </SidebarMenuButton>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  onClick={toggleSidebarOpen}
                  aria-label="Expand navigation"
                >
                  <PanelLeftOpen className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <SidebarMenuButton size="lg" type="button" className="h-auto min-h-12 min-w-0 flex-1 overflow-visible py-2">
                  <div className="flex w-full min-w-0 cursor-default text-left">
                    <Notes9Brand showIcon iconClassName="h-6 w-6" textClassName="h-5 w-auto" withTagline />
                  </div>
                </SidebarMenuButton>
                {!isMobile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground sm:size-9"
                    onClick={toggleSidebarOpen}
                    aria-label="Collapse navigation"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent
        className={cn("min-h-0 flex-1 overflow-y-auto", isIconMode && "gap-0 overflow-y-auto overflow-x-hidden pt-0")}
      >
        <SidebarGroup className={cn(isIconMode && "hidden")}>
          <SidebarGroupContent className="relative px-2">
            <div className="relative" data-tour="preview-app-search" id="tour-search">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
              <SidebarInput
                readOnly
                tabIndex={-1}
                placeholder="Search…"
                className="cursor-default pl-8"
                aria-label="Search (preview only)"
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup
          className={cn(isIconMode && "flex flex-col items-center gap-0.5 px-1.5 pb-1 pt-0")}
        >
          <SidebarGroupContent className={cn(isIconMode && "flex w-full flex-col items-center")}>
            <SidebarMenu
              data-tour="preview-app-nav"
              id="tour-main-nav"
              className={cn(isIconMode && "flex w-full flex-col items-center gap-0.5")}
            >
              {APP_PRIMARY_NAV.map((item) => {
                const Icon = item.icon
                const active = isNavActive(previewRoute, item.href)
                const r = previewRouteForHref(item.href)
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      isActive={active}
                      type="button"
                      title={isIconMode ? item.name : undefined}
                      onClick={() => {
                        dispatch({ type: "NAVIGATE", route: r })
                        setOpenMobile(false)
                      }}
                      className="group transition-all duration-150 hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] active:bg-[color:color-mix(in_oklab,var(--background)_70%,var(--primary)_30%)] dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground dark:active:scale-[0.985] dark:active:bg-sidebar-accent/90 data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className={cn("truncate", active && "font-semibold", isIconMode && "hidden")}>
                        {item.name}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

export function MarketingPreviewAppShell({
  state,
  dispatch,
  mainPanel,
  messages,
  setMessages,
}: {
  state: PreviewSessionFlags
  dispatch: (a: PreviewAction) => void
  mainPanel: React.ReactNode
  messages: Msg[]
  setMessages: (m: Msg[] | ((prev: Msg[]) => Msg[])) => void
}) {
  const [rightAiOpen, setRightAiOpen] = useState(true)

  useEffect(() => {
    const unsub = subscribePreviewTourStart(() => {
      startMarketingPreviewTour(0)
    })
    return () => {
      unsub()
      destroyPreviewTourDriver()
    }
  }, [])

  const onStartTour = () => startMarketingPreviewTour(0)
  const onGoToLabNotes = () => dispatch({ type: "NAVIGATE", route: "lab-notes" })

  return (
    <SidebarProvider
      defaultOpen
      className="!min-h-0 flex h-full min-h-0 w-full min-w-0 max-h-full max-w-full flex-1 flex-col overflow-hidden"
    >
      <div
        className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row items-stretch overflow-hidden rounded-[inherit] bg-background"
        data-preview-shell
      >
        <PreviewSidebarNav previewRoute={state.route} dispatch={dispatch} />
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
          <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PreviewHeaderBar
              previewRoute={state.route}
              onStartTour={onStartTour}
              aiOpen={rightAiOpen}
              onToggleAi={() => setRightAiOpen((o) => !o)}
            />
            <main
              data-tour="preview-app-main"
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-3 sm:p-4 md:p-6"
            >
              <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">{mainPanel}</div>
            </main>
          </SidebarInset>
          {rightAiOpen ? (
            <MarketingPreviewAiRail
              route={state.route}
              state={state}
              dispatch={dispatch}
              messages={messages}
              setMessages={setMessages}
              onGoToLabNotes={onGoToLabNotes}
              onClose={() => setRightAiOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </SidebarProvider>
  )
}

export function MarketingPreviewCtaRow() {
  return (
    <div
      data-tour="preview-app-cta"
      className="flex flex-col gap-2 border-t border-border/40 bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4"
    >
      <p className="max-w-xl text-[11px] text-muted-foreground sm:text-xs">
        Sample data in this session only. For real lab work, use your team workspace after sign up.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="h-8">
          <Link href="/auth/sign-up">Create account</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </div>
    </div>
  )
}
