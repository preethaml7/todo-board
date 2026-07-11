import { NextResponse } from "next/server";
import { exportBoard } from "@/db/repo";
import { requireUser } from "@/lib/auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    await requireUser();

    // 1. Generate logical JSON export
    const exportData = exportBoard();
    const jsonString = JSON.stringify(exportData, null, 2);

    // 2. Create ZIP in memory
    const zip = new AdmZip();
    zip.addFile("export.json", Buffer.from(jsonString, "utf8"));

    // 3. Add all attachments
    const attachmentsDir = path.join(process.cwd(), "data", "attachments");
    if (fs.existsSync(attachmentsDir)) {
      zip.addLocalFolder(attachmentsDir, "attachments");
    }

    // 4. Generate zip buffer
    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="boardspace-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    console.error("Export error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
