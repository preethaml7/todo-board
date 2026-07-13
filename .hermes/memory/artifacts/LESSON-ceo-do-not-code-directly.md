# Lesson — COO must not code directly

## Date
2026-07-13

## Context
When the CEO directed "add a proper company credit to the footer
proto🐼panda.io, dynamic year," the COO (Hermes) started writing
MarketingPage.tsx and MarketingPage.module.css directly. The CEO
corrected: "you should never do the work, you should always be the
COO and delegate the tasks following the hermes os operating guidelines."

## Lesson
The COO's role is planning, delegating, reviewing, and reporting.
Engineering execution is the assigned organizational role's job
(e.g., Lead Engineer).

## How the architecture handles single-runtime implementation
The current Hermes runtime executes work on behalf of the assigned
employee when no independent worker exists. This should be recorded
transparently as "Executed on behalf of Lead Engineer (single-runtime
implementation)" — not as "switching hats" or "acting as Lead Engineer."
The COO's identity does not change; the executor does the work.

## Triggering pattern to avoid
If a directive starts with "do/just/make the change" and the change
touches source code, default to:

  1. Write an initiative brief.
  2. Have the assigned employee do the work (Lead Engineer).
  3. QA verifies build / lint / tests / render.
  4. Hermes reviews.
  5. Mission Control records the outcome.
  6. Company Memory captures lessons.

The runtime executor may physically run the commands, but the
organizational record must reflect which role the work belongs to.

## Why this matters
The org architecture (CEO → COO → Employees → Work Products) is
durable across runtime changes. The single-runtime implementation
is a temporary execution detail. Framing work as "I am the Lead
Engineer now" collapses the org chart into the runtime and makes
it impossible to swap in independent workers later without
reframing the entire org.
