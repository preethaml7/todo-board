/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
} from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---- Mock server actions BEFORE importing the component ----
vi.mock("@/app/actions/files", () => {
  return {
    getFileTreeAction: vi.fn(async () => ({
      ok: true,
      data: [
        {
          id: 1,
          name: "research",
          type: "folder",
          path: "research",
          children: [
            {
              id: 11,
              name: "Q3-roadmap.md",
              type: "file",
              path: "research/Q3-roadmap.md",
              size: 4321,
              mime: "text/markdown",
              annotation_count: 2,
            },
            {
              id: 12,
              name: "spec.ts",
              type: "file",
              path: "research/spec.ts",
              size: 1234,
              mime: "text/typescript",
              annotation_count: 0,
            },
          ],
        },
        {
          id: 99,
          name: "orphan-image.png",
          type: "file",
          path: "orphan-image.png",
          size: 9999,
          mime: "image/png",
          annotation_count: 0,
        },
      ],
    })),
    getFolderChildrenAction: vi.fn(async (folderId: number | null) => {
      return { ok: true, data: [] };
    }),
    uploadFileAction: vi.fn(async () => ({
      ok: true,
      data: { id: 999, name: "new.txt", path: "new.txt", folder_id: null },
    })),
    createTextFileAction: vi.fn(async () => ({
      ok: true,
      data: { id: 1000, name: "note.md", path: "note.md", folder_id: null },
    })),
    renameFileAction: vi.fn(async (raw: { id: number; name: string }) => ({
      ok: true,
      data: { id: raw.id, name: raw.name, path: raw.name, folder_id: null },
    })),
    moveFileAction: vi.fn(async () => ({ ok: true, data: null })),
    trashFileAction: vi.fn(async () => ({ ok: true, data: null })),
    restoreFileAction: vi.fn(async () => ({ ok: true, data: null })),
    createFolderAction: vi.fn(async () => ({
      ok: true,
      data: { id: 555, name: "new-folder", parent_id: null },
    })),
    renameFolderAction: vi.fn(async () => ({ ok: true, data: null })),
    deleteFolderAction: vi.fn(async () => ({ ok: true, data: null })),
    listAnnotationsAction: vi.fn(async () => ({
      ok: true,
      data: [
        {
          id: 901,
          file_id: 11,
          kind: "line",
          line: 5,
          body: "this needs signoff",
          color: "gold",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
        {
          id: 902,
          file_id: 11,
          kind: "line",
          line: 12,
          body: "add a regression test",
          color: "gold",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
      ],
    })),
    createAnnotationAction: vi.fn(async () => ({
      ok: true,
      data: null,
    })),
    updateAnnotationAction: vi.fn(async () => ({ ok: true, data: null })),
    deleteAnnotationAction: vi.fn(async () => ({ ok: true, data: null })),
    attachFileToTaskAction: vi.fn(async () => ({ ok: true, data: null })),
    detachFileFromTaskAction: vi.fn(async () => ({ ok: true, data: null })),
    listFilesForTaskAction: vi.fn(async () => ({ ok: true, data: [] })),
  };
});

// Mock the file content fetch so tests don't hit the server.
vi.mock("@/app/actions/files-content", () => ({
  readFileContentAction: vi.fn(async (fileId: number) => {
    // Return a plausible markdown body for the test files; the test for
    // Q3-roadmap.md (id 11) gets markdown, others get text.
    if (fileId === 11) {
      return {
        ok: true,
        mime: "text/markdown",
        size: 4321,
        content:
          "# Heading 1\n\nSome intro paragraph.\n\n## Heading 2\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n",
        encoding: "utf8",
        name: "Q3-roadmap.md",
      };
    }
    return {
      ok: true,
      mime: "text/plain",
      size: 100,
      content: "Hello world",
      encoding: "utf8",
      name: "test.txt",
    };
  }),
}));

import FilesView from "./FilesView";

beforeEach(() => {
  cleanup();
  // Clear prompts/alerts so headless tests don't block.
  vi.spyOn(window, "prompt").mockImplementation(() => "new-folder");
  vi.spyOn(window, "confirm").mockImplementation(() => true);
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FilesView", () => {
  it("renders the file tree after loading", async () => {
    render(<FilesView />);
    const tree = await screen.findByTestId("file-tree");
    expect(tree).toBeInTheDocument();
    // The folder and a file are visible (folder starts collapsed at depth 0)
    expect(await screen.findByTestId("tree-folder-1")).toBeInTheDocument();
    // The top-level orphan file is also visible
    expect(await screen.findByTestId("tree-file-99")).toBeInTheDocument();
  });

  it("shows the upload button in the sidebar", async () => {
    render(<FilesView />);
    const btn = await screen.findByTestId("upload-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("title");
  });

  it("shows the new-folder button in the sidebar", async () => {
    render(<FilesView />);
    expect(await screen.findByTestId("new-folder-btn")).toBeInTheDocument();
  });

  it("renders the search box and filters the tree by name", async () => {
    render(<FilesView />);
    const search = await screen.findByTestId("search-input");
    expect(search).toBeInTheDocument();
    const user = userEvent.setup();
    // Typing a query that doesn't match any name hides nodes that don't
    // match — the top-level orphan image doesn't contain "roadmap".
    await user.type(search, "roadmap");
    // The orphan file should be filtered out
    expect(screen.queryByTestId("tree-file-99")).not.toBeInTheDocument();
    // The matching file (Q3-roadmap.md under research/) is also hidden
    // initially because research starts collapsed — we just verify the
    // search is wired up, not the deep match semantics.
  });

  it("clicking a file row opens the viewer for that file", async () => {
    render(<FilesView />);
    const file = await screen.findByTestId("tree-file-99");
    const user = userEvent.setup();
    await user.click(file);
    // Right pane should now show the file title and an annotations panel
    expect(await screen.findByTestId("annotations-panel")).toBeInTheDocument();
    // File actions row includes Rename/Attach/Trash
    expect(screen.getByTestId("rename-btn")).toBeInTheDocument();
    expect(screen.getByTestId("attach-btn")).toBeInTheDocument();
    expect(screen.getByTestId("trash-btn")).toBeInTheDocument();
  });

  it("clicking the Upload button has a hidden file input wired up", async () => {
    render(<FilesView />);
    await screen.findByTestId("upload-btn");
    // the hidden file input exists
    const input = document.querySelector(
      '[data-testid="file-input"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
    expect(input.type).toBe("file");
  });

  it("drag-and-drop zone is present in the sidebar", async () => {
    render(<FilesView />);
    const tree = await screen.findByTestId("file-tree");
    expect(tree).toBeInTheDocument();
    // Tree container has drag handlers; simulate a drop and check the
    // upload hint area appears.
    const dt = {
      types: ["Files"],
      files: [new File(["hi"], "x.txt", { type: "text/plain" })],
    } as unknown as DataTransfer;
    fireEvent.drop(tree, { dataTransfer: dt });
    // upload list should appear
    await waitFor(() =>
      expect(screen.getByTestId("upload-list")).toBeInTheDocument(),
    );
  });

  it("annotations can be added (popover opens, submits, triggers createAnnotationAction)", async () => {
    render(<FilesView />);
    const file = await screen.findByTestId("tree-file-99");
    const user = userEvent.setup();
    await user.click(file);
    // Open the rename modal? No — open a line annotation by clicking on the markdown viewer.
    // First switch to the markdown file:
    // Click the folder to expand it...
    const folder = await screen.findByTestId("tree-folder-1");
    await user.click(folder);
    // Now md file is visible
    const mdFile = await screen.findByTestId("tree-file-11");
    await user.click(mdFile);
    // Now there's a markdown viewer (sample text)
    expect(await screen.findByTestId("viewer-markdown")).toBeInTheDocument();
    // Click a line — pick the first .annLine element directly
    const lines = document.querySelectorAll('[data-line]');
    expect(lines.length).toBeGreaterThan(0);
    const { createAnnotationAction } = await import("@/app/actions/files");
    fireEvent.click(lines[0]);
    // Popover should be open
    const popover = await screen.findByTestId("line-popover");
    expect(popover).toBeInTheDocument();
    // Type and submit
    const ta = screen.getByTestId("line-popover-textarea");
    await user.type(ta, "verified by test");
    await user.click(screen.getByTestId("line-popover-submit"));
    expect(createAnnotationAction).toHaveBeenCalled();
  });

  it("annotations can be edited from the right panel", async () => {
    render(<FilesView />);
    const folder = await screen.findByTestId("tree-folder-1");
    const user = userEvent.setup();
    await user.click(folder);
    const mdFile = await screen.findByTestId("tree-file-11");
    await user.click(mdFile);
    // Two annotations are loaded by the mock (lines 5 and 12)
    expect(
      await screen.findByTestId("annotation-901"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("annotation-902")).toBeInTheDocument();
    // Click "Edit" on 901
    const { updateAnnotationAction } = await import("@/app/actions/files");
    await user.click(screen.getByTestId("annotation-edit-901"));
    const saveBtn = await screen.findByTestId("annotation-save-901");
    await user.click(saveBtn);
    expect(updateAnnotationAction).toHaveBeenCalled();
  });

  it("annotations can be deleted from the right panel", async () => {
    render(<FilesView />);
    const folder = await screen.findByTestId("tree-folder-1");
    const user = userEvent.setup();
    await user.click(folder);
    const mdFile = await screen.findByTestId("tree-file-11");
    await user.click(mdFile);
    await screen.findByTestId("annotation-901");
    const { deleteAnnotationAction } = await import("@/app/actions/files");
    await user.click(screen.getByTestId("annotation-delete-901"));
    expect(deleteAnnotationAction).toHaveBeenCalled();
  });

  it("renders the empty state when the tree has no entries", async () => {
    // Override the mock for this test only
    const filesMod = await import("@/app/actions/files");
    (filesMod.getFileTreeAction as any).mockResolvedValueOnce({
      ok: true,
      data: [],
    });
    render(<FilesView />);
    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    // The empty state contains the upload action button
    expect(screen.getByTestId("empty-upload")).toBeInTheDocument();
  });

  it("escape closes the line popover", async () => {
    render(<FilesView />);
    const folder = await screen.findByTestId("tree-folder-1");
    const user = userEvent.setup();
    await user.click(folder);
    const mdFile = await screen.findByTestId("tree-file-11");
    await user.click(mdFile);
    expect(await screen.findByTestId("viewer-markdown")).toBeInTheDocument();
    const lines = document.querySelectorAll('[data-line]');
    fireEvent.click(lines[0]);
    expect(await screen.findByTestId("line-popover")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("line-popover")).not.toBeInTheDocument();
  });
});
