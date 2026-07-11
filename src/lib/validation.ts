import { z } from "zod";
import {
  CATEGORY_COLORS,
  MAX_LIFE_AREA_LEN,
  PRIORITIES,
  STATUSES,
} from "./constants";

/* ------------------------------- auth --------------------------------- */

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(64, "Username is too long.")
  .regex(
    /^[a-zA-Z0-9._@-]+$/,
    "Use letters, numbers, and . _ - @ only.",
  );

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200, "Password is too long.");

export const onboardingSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

/* ------------------------------- tasks -------------------------------- */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(300),
  life_area: z.string().trim().min(1, "Life area is required.").max(MAX_LIFE_AREA_LEN),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  owner: z.string().trim().max(120).nullable().optional(),
  due_date: isoDate,
  revisit_date: isoDate,
  notes: z.string().max(5000).nullable().optional(),
  categoryIds: z.array(z.number().int().positive()).max(20).optional(),
  subtasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        done: z.boolean(),
      }),
    )
    .max(50)
    .optional(),
});

export type TaskInputParsed = z.infer<typeof taskInputSchema>;

export const moveTaskSchema = z.object({
  taskId: z.number().int().positive(),
  toStatus: z.enum(STATUSES),
  orderedIds: z.array(z.number().int().positive()).max(1000),
});

/* ----------------------------- categories ----------------------------- */

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  color: z.enum(CATEGORY_COLORS),
});

export const lifeAreaSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(MAX_LIFE_AREA_LEN),
  color: z.enum(CATEGORY_COLORS),
});

/* ------------------------------- meta --------------------------------- */

export const metaSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().max(400),
  chips: z
    .array(
      z.object({
        label: z.string().trim().max(40),
        value: z.string().trim().max(60),
      }),
    )
    .max(12),
});
