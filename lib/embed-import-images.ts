/**
 * Replace externally-linked images in imported HTML with inline data URIs, so
 * imported documents are self-contained (the image is *copied* into the note,
 * not just referenced — it won't break if the source URL later dies).
 *
 * Images that are already inline (data:/blob:) are left untouched. Fetches go
 * through `/api/import/embed-image` (server-side, to bypass CORS); any image
 * that can't be fetched keeps its original URL rather than failing the import.
 */
export async function embedImagesInHtml(html: string): Promise<string> {
  if (typeof window === "undefined" || !html) return html
  if (!/<img\b/i.test(html)) return html

  const doc = new DOMParser().parseFromString(html, "text/html")
  const external = Array.from(doc.querySelectorAll("img")).filter((img) =>
    /^https?:\/\//i.test(img.getAttribute("src") || ""),
  )
  if (external.length === 0) return html

  // De-duplicate by URL so repeated images are fetched once.
  const cache = new Map<string, string | null>()
  const CONCURRENCY = 4
  let cursor = 0

  const worker = async () => {
    while (cursor < external.length) {
      const img = external[cursor++]
      const src = img.getAttribute("src") || ""
      if (!cache.has(src)) {
        cache.set(src, await fetchDataUri(src))
      }
      const dataUri = cache.get(src)
      if (dataUri) img.setAttribute("src", dataUri)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, external.length) }, worker),
  )

  return doc.body.innerHTML
}

async function fetchDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch("/api/import/embed-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { dataUri?: string }
    return data.dataUri ?? null
  } catch {
    return null
  }
}
