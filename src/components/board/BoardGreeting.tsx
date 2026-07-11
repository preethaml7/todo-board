"use client";

/**
 * BoardGreeting — context-aware greeting in the header.
 *
 * Shows: "Good morning, Alex. 3 due today, 1 overdue."
 * Purely presentational. Stats come in as props from BoardApp.
 */
import * as React from "react";
import styles from "./BoardGreeting.module.css";
import { timeOfDayGreeting } from "@/lib/date";

type Props = {
  username: string;
  stats: {
    dueToday: number;
    overdue: number;
    inProgress: number;
    doneThisWeek: number;
  };
};

function Stat({ value, label, tone }: { value: number; label: string; tone?: "warn" | "good" | "muted" }) {
  return (
    <span className={`${styles.stat} ${tone ? styles[`tone-${tone}`] : ""}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </span>
  );
}

export function BoardGreeting({ username, stats }: Props) {
  const tod = timeOfDayGreeting();
  const headline = `Good ${tod}, ${username}.`;
  const summary =
    stats.overdue > 0
      ? `${stats.overdue} overdue${stats.dueToday > 0 ? `, ${stats.dueToday} due today` : ""}.`
      : stats.dueToday > 0
        ? `${stats.dueToday} due today.`
        : stats.inProgress > 0
          ? `${stats.inProgress} in flight.`
          : "All clear.";

  return (
    <div className={styles.wrap}>
      <div className={styles.greeting}>
        <span className={styles.emoji} aria-hidden>
          {tod === "morning" ? "🌅" : tod === "afternoon" ? "☀️" : tod === "evening" ? "🌆" : "🌙"}
        </span>
        <span>
          <span className={styles.headline}>{headline}</span>{" "}
          <span className={styles.summary}>{summary}</span>
        </span>
      </div>
      <div className={styles.stats} aria-label="Your activity this week">
        {stats.dueToday > 0 && <Stat value={stats.dueToday} label="due today" tone="warn" />}
        {stats.overdue > 0 && <Stat value={stats.overdue} label="overdue" tone="warn" />}
        {stats.inProgress > 0 && <Stat value={stats.inProgress} label="in flight" />}
        {stats.doneThisWeek > 0 && <Stat value={stats.doneThisWeek} label="done this week" tone="good" />}
      </div>
    </div>
  );
}
