import { CatalystFullPage } from "@/components/catalyst/catalyst-full-page"

export default async function CatalystPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session } = await searchParams
  return <CatalystFullPage sessionId={typeof session === "string" ? session : undefined} />
}

