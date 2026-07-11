"use server";

import { requireUser } from "@/lib/auth";
import { createTask, getCategories, setSubtasks, getBoardData } from "@/db/repo";
import type { BoardData } from "@/lib/types";
import type { ActionResult } from "./board";

/** Load a handful of illustrative tasks so the board isn't empty on day one. */
export async function seedSampleAction(): Promise<ActionResult<BoardData>> {
  await requireUser();
  const cats = getCategories();
  const byName = (n: string) => cats.find((c) => c.name === n)?.id;
  const ids = (...names: string[]) =>
    names.map(byName).filter((x): x is number => typeof x === "number");

  const today = new Date();
  const iso = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const samples = [
    {
      title: "Decide on SSO provider before Friday sync",
      life_area: "Work" as const,
      status: "backlog" as const,
      priority: "high" as const,
      due_date: iso(3),
      categoryIds: ids("Open Decision"),
    },
    {
      title: "Design doc: multi-tenant token store",
      life_area: "Work" as const,
      status: "todo" as const,
      priority: "high" as const,
      due_date: iso(5),
      categoryIds: ids("Requirement", "Action Item"),
      subtasks: [
        { title: "Draft data model", done: true },
        { title: "Review with security", done: false },
      ],
    },
    {
      title: "Pair with new hire on service integration",
      life_area: "Work" as const,
      status: "todo" as const,
      priority: "medium" as const,
      categoryIds: ids("Action Item"),
    },
    {
      title: "Book dentist appointment",
      life_area: "Personal" as const,
      status: "todo" as const,
      priority: "low" as const,
      due_date: iso(-1),
    },
    {
      title: "Review PRs for auth refactor",
      life_area: "Work" as const,
      status: "in_progress" as const,
      priority: "high" as const,
      due_date: iso(0),
      categoryIds: ids("Review"),
    },
    {
      title: "Blocked: waiting on infra approval for staging cluster",
      life_area: "Work" as const,
      status: "onhold" as const,
      priority: "medium" as const,
      categoryIds: ids("Action Item"),
    },
    {
      title: "Investigate p95 latency spike in checkout",
      life_area: "Work" as const,
      status: "done" as const,
      priority: "high" as const,
      categoryIds: ids("Bug / Risk"),
    },
    {
      title: "Plan weekend hiking trip",
      life_area: "Personal" as const,
      status: "onhold" as const,
      priority: "low" as const,
      revisit_date: iso(21),
    },
  ];

  for (const s of samples) {
    const { subtasks, ...fields } = s as typeof s & {
      subtasks?: { title: string; done: boolean }[];
    };
    const task = createTask(fields);
    if (subtasks?.length) setSubtasks(task.id, subtasks);
  }

  return { ok: true, data: getBoardData() };
}
