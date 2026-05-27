import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"
import { createBucketSignedUrl } from "@/lib/storage-signed-url"

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/json',
];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/chat-attachments/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    const signedUrl = await createBucketSignedUrl(supabase, USER_STORAGE_BUCKET, storagePath);

    return NextResponse.json({
      url: signedUrl,
      storagePath,
      pathname: file.name,
      contentType: file.type,
      size: file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
