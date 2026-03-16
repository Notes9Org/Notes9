import { redirect } from "next/navigation"

export async function generateStaticParams() {
  return []
}

export default async function MarketingDocumentPage() {
  redirect("/resources")
}
