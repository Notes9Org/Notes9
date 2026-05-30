import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket";

// Re-mint signed URLs for previously-uploaded chat attachments. The `user`
// bucket is private, so a signed URL persisted in message metadata eventually
// expires (7-day TTL) and dies on a later page load. We persist the
// `storagePath` instead and call this endpoint to refresh the link.
//
// Security: we use the *user-scoped* Supabase client (anon key + the caller's
// session cookie), so storage RLS — first path segment must equal auth.uid()
// — is enforced by Postgres. A user can never sign another user's object even
// if they guess the path. We also defensively reject paths outside the
// caller's own prefix before hitting the network.
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_PATHS_PER_REQUEST = 50;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawPaths = (body as { storagePaths?: unknown })?.storagePaths;
    if (!Array.isArray(rawPaths)) {
      return NextResponse.json(
        { error: "storagePaths must be an array" },
        { status: 400 },
      );
    }

    const ownPrefix = `${user.id}/`;
    const paths = Array.from(
      new Set(
        rawPaths
          .filter((p): p is string => typeof p === "string" && p.length > 0)
          .map((p) => p.trim())
          .filter((p) => p.startsWith(ownPrefix)),
      ),
    ).slice(0, MAX_PATHS_PER_REQUEST);

    if (paths.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const supabase = await createClient();

    // createSignedUrls (plural) is one round-trip for the whole batch.
    const { data, error } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error("Failed to batch-sign attachment URLs", {
        user_id: user.id,
        error: error.message,
      });
      return NextResponse.json({ error: "Failed to sign URLs" }, { status: 500 });
    }

    // Map path -> signed url. Rows whose object is missing/expired come back
    // with `error` set and no signedUrl; we simply omit them so the client
    // renders a graceful "expired" fallback.
    const urls: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) urls[row.path] = row.signedUrl;
    }

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("Sign error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
