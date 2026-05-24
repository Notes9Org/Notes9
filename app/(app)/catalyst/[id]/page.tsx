import { CatalystFullPage } from "@/components/catalyst/catalyst-full-page"

export default async function CatalystSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CatalystFullPage sessionId={id} />
}

