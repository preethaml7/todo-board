import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAttachmentRow } from "@/db/repo";
import { readAttachmentFile, isInlineMime } from "@/lib/attachments-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve an attachment to the authenticated user. Images in a small allowlist
 * are served inline; everything else is forced to download (Content-Disposition
 * attachment + octet-stream + nosniff) so a malicious upload can't execute in
 * the app's origin. The session cookie is SameSite=Lax, so cross-site <img>
 * hotlinks don't carry it and are rejected.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const row = getAttachmentRow(id);
  if (!row) return new NextResponse("Not found", { status: 404 });

  const bytes = await readAttachmentFile(row.stored_name);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  const inline = isInlineMime(row.mime);
  const safeName = row.filename.replace(/[\r\n"]/g, "");
  const body = new Uint8Array(bytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": inline ? row.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
