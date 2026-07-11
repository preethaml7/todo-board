import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/db/client";
import { 
  createTask, 
  resetBoard, 
  addAttachment,
  getBoardData
} from "@/db/repo";
import { GET as exportRoute } from "@/app/api/export/route";
import { importBoardAction } from "@/app/actions/board";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

vi.mock("server-only", () => ({}));

// Mock NextResponse for the API route
vi.mock("next/server", () => {
  return {
    NextResponse: class {
      body: any;
      status: number;
      headers: any;
      constructor(body: any, init: any) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.headers = init?.headers;
      }
    }
  };
});

// Mock auth since both export Route and import Action call requireUser()
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue(true)
}));

describe("Export / Import E2E", () => {
  const attachmentsDir = path.join(process.cwd(), "data", "attachments");

  beforeEach(() => {
    resetBoard();
    if (fs.existsSync(attachmentsDir)) {
      fs.rmSync(attachmentsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(attachmentsDir, { recursive: true });
  });

  afterEach(() => {
    resetBoard();
    if (fs.existsSync(attachmentsDir)) {
      fs.rmSync(attachmentsDir, { recursive: true, force: true });
    }
  });

  it("exports a ZIP with json and attachments, and imports them back perfectly", async () => {
    // 1. Setup Initial Data
    const task = createTask({
      title: "Test Task with Attachment",
      life_area: "Personal",
      status: "todo",
      priority: "high"
    });

    // Write a physical dummy file
    const dummyFileName = `dummy-${Date.now()}.txt`;
    const dummyFilePath = path.join(attachmentsDir, dummyFileName);
    fs.writeFileSync(dummyFilePath, "Hello, world!");

    // Register attachment in DB
    addAttachment({
      task_id: task.id,
      filename: "hello.txt",
      mime: "text/plain",
      size: 13,
      stored_name: dummyFileName
    });

    const beforeBoard = getBoardData();
    expect(beforeBoard.tasks.length).toBe(1);
    expect(beforeBoard.tasks[0].attachmentCount).toBe(1);

    // 2. Perform Export
    const response = await exportRoute() as any;
    expect(response.status).toBe(200);
    
    const zipBuffer = response.body as Buffer;
    expect(Buffer.isBuffer(zipBuffer)).toBe(true);

    // Verify ZIP contents
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    
    const jsonEntry = entries.find(e => e.entryName === "export.json");
    expect(jsonEntry).toBeDefined();

    const attachmentEntry = entries.find(e => e.entryName === `attachments/${dummyFileName}`);
    expect(attachmentEntry).toBeDefined();
    expect(attachmentEntry?.getData().toString("utf8")).toBe("Hello, world!");

    // 3. Wipe System
    resetBoard();
    fs.rmSync(attachmentsDir, { recursive: true, force: true });
    expect(getBoardData().tasks.length).toBe(0);
    expect(fs.existsSync(dummyFilePath)).toBe(false);

    // 4. Perform Import
    // Emulate a File object wrapped in FormData
    const formData = new FormData();
    const file = new File([zipBuffer], "backup.zip", { type: "application/zip" });
    formData.append("file", file);

    const importResult = await importBoardAction(formData);
    expect(importResult.ok).toBe(true);

    // 5. Verify Data Restored
    const afterBoard = getBoardData();
    expect(afterBoard.tasks.length).toBe(1);
    expect(afterBoard.tasks[0].title).toBe("Test Task with Attachment");
    expect(afterBoard.tasks[0].attachmentCount).toBe(1);

    // Verify physical file restored
    expect(fs.existsSync(dummyFilePath)).toBe(true);
    expect(fs.readFileSync(dummyFilePath, "utf8")).toBe("Hello, world!");
  });
});
