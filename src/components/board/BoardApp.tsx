"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BoardData,
  Category,
  Chip,
  LifeArea,
  Task,
  TrashedTask,
} from "@/lib/types";
import { STATUS_META, ISSUE_PREFIX, type Status } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import type { ParsedQuickAdd } from "@/lib/nlp";
import { overviewBucket } from "@/lib/date";
import {
  BoardContext,
  type BoardContextValue,
  type CategoryFilter,
  type LifeFilter,
  type ViewMode,
} from "./board-context";
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  moveTaskAction,
  togglePinAction,
  resetBoardAction,
  importBoardAction,
  getTrashAction,
  restoreTaskAction,
  purgeTaskAction,
  emptyTrashAction,
} from "@/app/actions/board";
import { seedSampleAction } from "@/app/actions/sample";
import { celebrate } from "./celebrate";
import Header from "./Header";
import Toolbar from "./Toolbar";
import BoardView from "./BoardView";
import ListView from "./ListView";
import OverviewView from "./OverviewView";
import FilesView from "./FilesView";
import TaskModal, { type TaskDraft } from "./TaskModal";
import CommandPalette from "./CommandPalette";
import HelpDialog from "./HelpDialog";
import TrashView from "./TrashView";
import Toasts, { type ToastItem, type ToastAction } from "./Toasts";
import { QuickCapture, QuickCaptureFab, useQuickCaptureHotkey } from "./QuickCapture";

interface ModalState {
  mode: "new" | "edit";
  task?: Task;
  defaultStatus?: Status;
}

export default function BoardApp({
  initialBoard,
  username,
}: {
  initialBoard: BoardData;
  username: string;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialBoard.tasks);
  const [categories, setCategories] = useState<Category[]>(
    initialBoard.categories,
  );
  const [lifeAreas, setLifeAreas] = useState<LifeArea[]>(
    initialBoard.lifeAreas,
  );
  const [meta, setMeta] = useState(initialBoard.meta);

  const [view, setView] = useState<ViewMode>("board");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [lifeFilter, setLifeFilter] = useState<LifeFilter>("all");
  const [search, setSearch] = useState("");

  const [modal, setModal] = useState<ModalState | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  // Global ⌘+Shift+T / Ctrl+Shift+T / 'q' to open quick capture
  useQuickCaptureHotkey(() => setQuickCaptureOpen(true));
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [trashCount, setTrashCount] = useState(initialBoard.trashCount);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashed, setTrashed] = useState<TrashedTask[]>([]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const lifeAreaByName = useMemo(
    () => new Map(lifeAreas.map((a) => [a.name, a])),
    [lifeAreas],
  );
  // Clean, contiguous serial numbers (TASK-1 … TASK-N) by creation order —
  // independent of database ids, so there are no gaps.
  const seqById = useMemo(() => {
    const ordered = [...tasks].sort((a, b) =>
      a.created_at < b.created_at
        ? -1
        : a.created_at > b.created_at
          ? 1
          : a.id - b.id,
    );
    const m = new Map<number, number>();
    ordered.forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [tasks]);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: "info" | "error" = "info", action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, kind, action }]);
      setTimeout(() => dismissToast(id), action ? 6000 : 3200);
    },
    [dismissToast],
  );

  // Bring a trashed task back to the board (shared by Undo + the Trash view).
  const restoreById = useCallback(
    async (id: number) => {
      const res = await restoreTaskAction(id);
      if (!res.ok || !res.data) {
        toast(res.error ?? "Could not restore.", "error");
        return false;
      }
      setTasks((prev) =>
        prev.some((t) => t.id === id) ? prev : [...prev, res.data!],
      );
      setTrashCount((n) => Math.max(0, n - 1));
      return true;
    },
    [toast],
  );

  /* --------------------------- greeting stats --------------------------- */
  // Recomputed whenever the task list changes (e.g., after a CRUD action or a
  // status move). Cheap O(n) — no need to memo.
  const greetingStats = useMemo(() => {
    let dueToday = 0;
    let overdue = 0;
    let inProgress = 0;
    let doneThisWeek = 0;
    const weekAgo = Date.now() - 7 * 86_400_000;
    for (const t of tasks) {
      const bucket = overviewBucket(t.due_date, t.status === "done");
      if (bucket === "today") dueToday++;
      else if (bucket === "overdue") overdue++;
      if (t.status === "in_progress") inProgress++;
      if (t.status === "done" && new Date(t.updated_at).getTime() >= weekAgo) {
        doneThisWeek++;
      }
    }
    return { dueToday, overdue, inProgress, doneThisWeek };
  }, [tasks]);

  /* --------------------------- filtering --------------------------- */
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (lifeFilter !== "all" && t.life_area !== lifeFilter) return false;
      if (categoryFilter === "uncategorized" && t.categoryIds.length > 0)
        return false;
      if (
        typeof categoryFilter === "number" &&
        !t.categoryIds.includes(categoryFilter)
      )
        return false;
      if (q) {
        const hay = (
          t.title +
          " " +
          (t.notes ?? "") +
          " " +
          (t.owner ?? "")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, lifeFilter, categoryFilter, search]);

  /* ---------------------------- task ops --------------------------- */
  const openNewTask = useCallback((status?: Status) => {
    setModal({ mode: "new", defaultStatus: status ?? "todo" });
  }, []);
  const openTask = useCallback((task: Task) => {
    setModal({ mode: "edit", task });
  }, []);

  const saveTask = useCallback(
    async (draft: TaskDraft, id?: number) => {
      const res = id
        ? await updateTaskAction(id, draft)
        : await createTaskAction(draft);
      if (!res.ok || !res.data) {
        toast(res.error ?? "Could not save the task.", "error");
        return;
      }
      const saved = res.data;
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === saved.id);
        return exists
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [...prev, saved];
      });
      setModal(null);
      toast(id ? "Task updated" : "Task added");
    },
    [toast],
  );

  const deleteTask = useCallback(
    async (id: number) => {
      const res = await deleteTaskAction(id);
      if (!res.ok) {
        toast(res.error ?? "Could not delete the task.", "error");
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setTrashCount((n) => n + 1);
      setModal(null);
      toast("Moved to Trash", "info", {
        label: "Undo",
        onClick: () => {
          void restoreById(id);
        },
      });
    },
    [toast, restoreById],
  );

  /**
   * Toggle a task's pinned flag. Optimistic: flip the local state immediately,
   * reconcile on server response.
   */
  const togglePin = useCallback(
    async (id: number) => {
      // Optimistic update — flip the local copy first
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
      );
      const res = await togglePinAction(id);
      if (!res.ok || !res.data) {
        // Roll back
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
        );
        toast(res.error ?? "Could not pin the task.", "error");
      }
    },
    [toast],
  );

  /* ------------------------------ trash ---------------------------- */
  const openTrash = useCallback(async () => {
    const res = await getTrashAction();
    if (!res.ok || !res.data) {
      toast(res.error ?? "Could not open Trash.", "error");
      return;
    }
    setTrashed(res.data);
    setTrashCount(res.data.length);
    setTrashOpen(true);
  }, [toast]);

  const restoreFromTrash = useCallback(
    async (id: number) => {
      if (await restoreById(id)) {
        setTrashed((prev) => prev.filter((t) => t.id !== id));
        toast("Task restored");
      }
    },
    [restoreById, toast],
  );

  const purgeFromTrash = useCallback(
    async (id: number) => {
      const res = await purgeTaskAction(id);
      if (!res.ok) {
        toast(res.error ?? "Could not delete.", "error");
        return;
      }
      setTrashed((prev) => prev.filter((t) => t.id !== id));
      setTrashCount((n) => Math.max(0, n - 1));
      toast("Deleted permanently");
    },
    [toast],
  );

  const emptyTheTrash = useCallback(async () => {
    const res = await emptyTrashAction();
    if (!res.ok) {
      toast(res.error ?? "Could not empty Trash.", "error");
      return;
    }
    setTrashed([]);
    setTrashCount(0);
    toast("Trash emptied");
  }, [toast]);

  const moveTask = useCallback(
    (taskId: number, toStatus: Status, orderedIds: number[]) => {
      // Optimistic update: apply status + new ordering locally right away.
      setTasks((prev) => {
        const posOf = new Map(orderedIds.map((id, i) => [id, i]));
        return prev.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              status: toStatus,
              position: posOf.get(t.id) ?? t.position,
              completed_at:
                toStatus === "done"
                  ? (t.completed_at ?? new Date().toISOString())
                  : null,
            };
          }
          if (posOf.has(t.id)) return { ...t, position: posOf.get(t.id)! };
          return t;
        });
      });
      moveTaskAction({ taskId, toStatus, orderedIds }).then((res) => {
        if (!res.ok) toast(res.error ?? "Could not move the task.", "error");
      });
    },
    [toast],
  );

  const quickAddTask = useCallback(
    async (status: Status, parsed: ParsedQuickAdd) => {
      const t = parsed.title.trim();
      if (!t) return;
      const res = await createTaskAction({
        title: t,
        life_area: parsed.life_area ?? lifeAreas[0]?.name ?? "Personal",
        status,
        priority: parsed.priority ?? "medium",
        owner: null,
        due_date: parsed.due_date,
        revisit_date: null,
        notes: null,
        categoryIds: parsed.categoryIds,
        subtasks: [],
      });
      if (!res.ok || !res.data) {
        toast(res.error ?? "Could not add the task.", "error");
        return;
      }
      setTasks((prev) => [...prev, res.data!]);
    },
    [lifeAreas, toast],
  );

  const moveTaskToStatus = useCallback(
    (taskId: number, toStatus: Status) => {
      const current = tasks.find((t) => t.id === taskId);
      const prevStatus = current?.status;
      const orderTo = (dest: Status) => [
        ...tasks
          .filter((t) => t.status === dest && t.id !== taskId)
          .sort((a, b) => a.position - b.position || a.id - b.id)
          .map((t) => t.id),
        taskId,
      ];
      moveTask(taskId, toStatus, orderTo(toStatus));
      if (toStatus === "done" && prevStatus !== "done") celebrate();
      if (prevStatus && prevStatus !== toStatus) {
        toast(`Moved to ${STATUS_META[toStatus].label}`, "info", {
          label: "Undo",
          onClick: () => moveTask(taskId, prevStatus, orderTo(prevStatus)),
        });
      }
    },
    [tasks, moveTask, toast],
  );

  const setTaskAttachmentCount = useCallback((taskId: number, count: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, attachmentCount: count } : t,
      ),
    );
  }, []);

  const refreshCategories = useCallback((cats: Category[]) => {
    setCategories(cats);
  }, []);
  const refreshLifeAreas = useCallback((areas: LifeArea[]) => {
    setLifeAreas(areas);
  }, []);

  /* ----------------------- board-level ops ------------------------- */
  const doExport = useCallback(() => {
    // Simply navigate to the export API route which handles streaming the ZIP
    window.location.href = "/api/export";
    toast("Starting ZIP export...");
  }, [toast]);

  const doExportCsv = useCallback(() => {
    const header = [
      "Key",
      "Title",
      "Status",
      "Priority",
      "Life area",
      "Categories",
      "Due date",
      "Revisit date",
      "Created",
      "Notes",
    ];
    const rows = [...tasks]
      .sort((a, b) => (seqById.get(a.id) ?? 0) - (seqById.get(b.id) ?? 0))
      .map((t) => [
        `${ISSUE_PREFIX}-${seqById.get(t.id) ?? t.id}`,
        t.title,
        STATUS_META[t.status].label,
        t.priority,
        t.life_area,
        t.categoryIds
          .map((id) => categoryById.get(id)?.name)
          .filter(Boolean)
          .join("; "),
        t.due_date ?? "",
        t.revisit_date ?? "",
        t.created_at.slice(0, 10),
        t.notes ?? "",
      ]);
    const blob = new Blob([toCsv(header, rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boardspace-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Board exported (CSV)");
  }, [tasks, seqById, categoryById, toast]);

  const doImport = useCallback(
    async (file: File) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await importBoardAction(formData);
        if (!res.ok || !res.data) {
          toast(res.error ?? "Import failed.", "error");
          return;
        }
        setTasks(res.data.tasks);
        setCategories(res.data.categories);
        setLifeAreas(res.data.lifeAreas);
        setMeta(res.data.meta);
        setTrashCount(res.data.trashCount);
        toast("Board imported successfully.");
      } catch {
        toast("Failed to process the import file.", "error");
      }
    },
    [toast],
  );

  const doReset = useCallback(async () => {
    const res = await resetBoardAction();
    if (!res.ok || !res.data) {
      toast("Reset failed.", "error");
      return;
    }
    setTasks(res.data.tasks);
    setTrashCount(res.data.trashCount);
    toast("Board cleared");
  }, [toast]);

  const doSeed = useCallback(async () => {
    const res = await seedSampleAction();
    if (!res.ok || !res.data) {
      toast("Could not load samples.", "error");
      return;
    }
    setTasks(res.data.tasks);
    setCategories(res.data.categories);
    setLifeAreas(res.data.lifeAreas);
    setTrashCount(res.data.trashCount);
    toast("Sample tasks loaded");
  }, [toast]);

  const updateMeta = useCallback(
    (next: { title: string; subtitle: string; chips: Chip[] }) => {
      setMeta(next);
    },
    [],
  );

  /* -------------------------- shortcuts ---------------------------- */
  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        node.isContentEditable
      );
    }
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openNewTask();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key >= "1" && e.key <= "5" && view === "board") {
        window.dispatchEvent(
          new CustomEvent("focus-column", { detail: Number(e.key) - 1 }),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNewTask, view]);

  const ctx: BoardContextValue = {
    tasks,
    categories,
    categoryById,
    lifeAreas,
    lifeAreaByName,
    seqById,
    view,
    setView,
    categoryFilter,
    setCategoryFilter,
    lifeFilter,
    setLifeFilter,
    search,
    setSearch,
    visibleTasks,
    openNewTask,
    openTask,
    moveTask,
    moveTaskToStatus,
    quickAddTask,
    togglePin,
    refreshCategories,
    refreshLifeAreas,
    toast,
  };

  return (
    <BoardContext.Provider value={ctx}>
      <div className="app-shell">
        <Header
          meta={meta}
          username={username}
          trashCount={trashCount}
          greeting={greetingStats}
          onExport={doExport}
          onExportCsv={doExportCsv}
          onImport={doImport}
          onReset={doReset}
          onMetaChange={updateMeta}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenTrash={openTrash}
        />
        <Toolbar
          onManageCategories={refreshCategories}
          onManageLifeAreas={refreshLifeAreas}
        />

        {view === "board" && <BoardView onSeed={doSeed} />}
        {view === "list" && <ListView />}
        {view === "overview" && <OverviewView />}
        {view === "files" && <FilesView />}
      </div>

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          defaultStatus={modal.defaultStatus}
          categories={categories}
          lifeAreas={lifeAreas}
          onClose={() => setModal(null)}
          onSave={saveTask}
          onDelete={deleteTask}
          onLifeAreasChange={refreshLifeAreas}
          onAttachmentCount={setTaskAttachmentCount}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNewTask={() => {
            setPaletteOpen(false);
            openNewTask();
          }}
          onOpenTask={(t) => {
            setPaletteOpen(false);
            openTask(t);
          }}
          onSetView={(v) => {
            setPaletteOpen(false);
            setView(v);
          }}
          onToggleTheme={() => {
            const isDark = document.documentElement.classList.contains("dark");
            document.documentElement.classList.toggle("dark", !isDark);
            try {
              localStorage.setItem("theme", isDark ? "light" : "dark");
            } catch {}
          }}
          onShowHelp={() => {
            setPaletteOpen(false);
            setHelpOpen(true);
          }}
        />
      )}

      <QuickCapture
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        onSubmit={(parsed) => quickAddTask("todo", parsed)}
        categories={categories}
        lifeAreas={lifeAreas}
      />
      {!quickCaptureOpen && !modal && (
        <QuickCaptureFab onClick={() => setQuickCaptureOpen(true)} />
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {trashOpen && (
        <TrashView
          tasks={trashed}
          categoryById={categoryById}
          lifeAreaByName={lifeAreaByName}
          onClose={() => setTrashOpen(false)}
          onRestore={restoreFromTrash}
          onPurge={purgeFromTrash}
          onEmpty={emptyTheTrash}
        />
      )}

      <Toasts toasts={toasts} onAction={dismissToast} />
    </BoardContext.Provider>
  );
}
