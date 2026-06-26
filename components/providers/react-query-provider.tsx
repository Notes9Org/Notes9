"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// App-wide TanStack Query client for client-side data fetching (listing pages
// that read directly from the Supabase browser client). Replaces the previous
// "refetch on every mount" pattern with caching, request de-duplication, and
// background revalidation, so navigating away and back is instant instead of
// triggering a fresh round trip each time.
//
// `staleTime` keeps fetched lists fresh for a minute before a background
// refetch; `refetchOnWindowFocus` is disabled to avoid surprise refetches on
// tab switches. The QueryClient is created lazily in state so it is stable
// across re-renders and isolated per browser session.
export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
