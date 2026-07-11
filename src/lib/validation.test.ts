import { describe, it, expect } from "vitest";
import {
  usernameSchema,
  passwordSchema,
  taskInputSchema,
  lifeAreaSchema,
} from "./validation";

describe("usernameSchema", () => {
  it("accepts valid usernames", () => {
    expect(usernameSchema.safeParse("testuser").success).toBe(true);
    expect(usernameSchema.safeParse("a.b_c-1@x").success).toBe(true);
  });
  it("rejects too short or illegal characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("has space").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("requires at least 10 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough1").success).toBe(true);
  });
});

describe("taskInputSchema", () => {
  const base = {
    title: "Do a thing",
    life_area: "Work",
    status: "onhold",
    priority: "high",
  };
  it("accepts a valid task with the on-hold status", () => {
    expect(taskInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects retired statuses (blocked/deferred)", () => {
    expect(
      taskInputSchema.safeParse({ ...base, status: "blocked" }).success,
    ).toBe(false);
    expect(
      taskInputSchema.safeParse({ ...base, status: "deferred" }).success,
    ).toBe(false);
  });
  it("requires a non-empty title", () => {
    expect(taskInputSchema.safeParse({ ...base, title: "  " }).success).toBe(
      false,
    );
  });
});

describe("lifeAreaSchema", () => {
  it("validates name + palette color", () => {
    expect(lifeAreaSchema.safeParse({ name: "Health", color: "green" }).success).toBe(
      true,
    );
    expect(lifeAreaSchema.safeParse({ name: "", color: "green" }).success).toBe(
      false,
    );
    expect(lifeAreaSchema.safeParse({ name: "X", color: "chartreuse" }).success).toBe(
      false,
    );
  });
});
