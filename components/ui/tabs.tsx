'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const TabsContext = React.createContext<{
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
} | null>(null)

function scrollActiveTriggerToCenter(container: HTMLDivElement) {
  if (container.clientWidth >= container.scrollWidth) return
  const active = container.querySelector<HTMLElement>('[data-state="active"]')
  if (!active) return
  const scrollLeft =
    active.offsetLeft -
    container.clientWidth / 2 +
    active.offsetWidth / 2
  const maxScroll = container.scrollWidth - container.clientWidth
  container.scrollTo({
    left: Math.max(0, Math.min(scrollLeft, maxScroll)),
    behavior: 'smooth',
  })
}

function Tabs({
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const handleValueChange = React.useCallback(
    (value: string) => {
      onValueChange?.(value)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current
          if (container) scrollActiveTriggerToCenter(container)
        })
      })
    },
    [onValueChange]
  )
  return (
    <TabsContext.Provider value={{ scrollContainerRef }}>
      <TabsPrimitive.Root onValueChange={handleValueChange} {...props} />
    </TabsContext.Provider>
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const ctx = React.useContext(TabsContext)
  const localScrollRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = ctx?.scrollContainerRef ?? localScrollRef
  const [showLeft, setShowLeft] = React.useState(false)
  const [showRight, setShowRight] = React.useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return

    setShowLeft(el.scrollLeft > 0)
    setShowRight(
      el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    )
  }

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return

    el.scrollBy({
      left:
        direction === 'left'
          ? -el.clientWidth / 2
          : el.clientWidth / 2,
      behavior: 'smooth',
    })
  }

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const run = () => checkScroll()

    requestAnimationFrame(run)

    window.addEventListener('resize', run)
    return () => window.removeEventListener('resize', run)
  }, [])

  // Center the default/initial active tab on first load when list overflows
  React.useEffect(() => {
    if (!ctx) return
    const el = scrollRef.current
    if (!el) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollActiveTriggerToCenter(el)
      })
    })
    return () => cancelAnimationFrame(id)
  }, [ctx])

  return (
    <div className="relative">
      {showLeft && (
        <div className="absolute left-0 top-0 h-full flex items-center pl-1 pr-1 z-10"
          style={{
            background: "linear-gradient(to right, var(--background) 80%, rgba(255,255,255,0))",
            borderRadius: 0,
          }}
        >
          <button
            onClick={() => scroll('left')}
            className="w-7 h-7 transition flex justify-center items-center"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {showRight && (
        <div className="absolute right-0 top-0 h-full flex items-center pr-1 pl-1 z-10"
          style={{
            background: "linear-gradient(to left, var(--background) 80%, rgba(255,255,255,0))",
            borderRadius: 0,
          }}
        >
          <button
            onClick={() => scroll('right')}
            className="w-7 h-7 transition flex justify-center items-center"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="overflow-x-auto scroll-smooth hide-scrollbar"
      >
        <TabsPrimitive.List
          className={cn(
            'inline-flex min-w-max h-9 items-center bg-muted rounded-md p-1 gap-1',
            className
          )}
          {...props}
        />
      </div>
    </div>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
