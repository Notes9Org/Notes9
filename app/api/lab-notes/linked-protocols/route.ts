import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-client";

type LinkedProtocol = {
  id: string;
  protocol_id: string;
  protocol: {
    id: string;
    name: string;
    version: string | null;
  };
};

type RpcLinkedProtocolRow = {
  id: string;
  protocol_id: string;
  protocol_name: string | null;
  protocol_version: string | null;
};

function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42883") return true;
  return (error.message ?? "").toLowerCase().includes("does not exist");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const labNoteId = searchParams.get("labNoteId");

    if (!labNoteId) {
      return NextResponse.json({ error: "Lab note ID is required" }, { status: 400 });
    }

    const readableNote = await supabase
      .from("lab_notes")
      .select("id, created_by")
      .eq("id", labNoteId)
      .maybeSingle();

    const ownerId = readableNote.data?.created_by ?? null;
    const isOwner = ownerId ? String(ownerId) === String(user.id) : false;
    // If user can read the note row via existing RLS, they should be allowed to view linked protocols.
    const canReadNoteViaRls = Boolean(readableNote.data);

    const accessCheck = await supabase
      .from("lab_note_access")
      .select("id")
      .eq("lab_note_id", labNoteId)
      .eq("user_id", user.id)
      .maybeSingle();

    const hasAccess = isOwner || canReadNoteViaRls || Boolean(accessCheck.data);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this lab note" },
        { status: 403 }
      );
    }

    // Preferred path: security-definer RPC that enforces note access and bypasses row-level edge cases.
    const rpcResult = await supabase.rpc("get_lab_note_linked_protocols", {
      p_lab_note_id: labNoteId,
    });

    if (!rpcResult.error && Array.isArray(rpcResult.data)) {
      const linkedProtocols: LinkedProtocol[] = (rpcResult.data as RpcLinkedProtocolRow[]).map(
        (row) => ({
          id: row.id,
          protocol_id: row.protocol_id,
          protocol: {
            id: row.protocol_id,
            name: row.protocol_name ?? "Unnamed protocol",
            version: row.protocol_version ?? null,
          },
        })
      );

      return NextResponse.json({ linkedProtocols });
    }

    // Backward-compatible fallback for environments where the RPC migration is not applied yet.
    if (rpcResult.error && !isMissingFunctionError(rpcResult.error)) {
      return NextResponse.json(
        { error: "Failed to fetch linked protocols", details: rpcResult.error.message },
        { status: 500 }
      );
    }

    // Fallback path: use admin client to avoid collaborator RLS edge cases on lab_note_protocols/protocols.
    const linkReader = admin ?? supabase;
    const { data: links, error: linksError } = await linkReader
      .from("lab_note_protocols")
      .select("id, protocol_id")
      .eq("lab_note_id", labNoteId);

    if (linksError) {
      return NextResponse.json(
        { error: "Failed to fetch linked protocols", details: linksError.message },
        { status: 500 }
      );
    }

    if (!links || links.length === 0) {
      return NextResponse.json({ linkedProtocols: [] satisfies LinkedProtocol[] });
    }

    const protocolIds = links.map((row: any) => row.protocol_id).filter(Boolean);
    const { data: protocols, error: protocolsError } = await linkReader
      .from("protocols")
      .select("id, name, version")
      .in("id", protocolIds);

    if (protocolsError) {
      return NextResponse.json(
        { error: "Failed to fetch protocol details", details: protocolsError.message },
        { status: 500 }
      );
    }

    const protocolsById = new Map(
      (protocols || []).map((protocol: any) => [
        protocol.id,
        {
          id: protocol.id,
          name: protocol.name,
          version: protocol.version ?? null,
        },
      ])
    );

    const linkedProtocols: LinkedProtocol[] = links
      .map((row: any) => ({
        id: row.id,
        protocol_id: row.protocol_id,
        protocol: protocolsById.get(row.protocol_id) ?? {
          id: row.protocol_id,
          name: "Unnamed protocol",
          version: null,
        },
      }))

    return NextResponse.json({ linkedProtocols });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
