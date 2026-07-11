import { createInterface, type Interface } from "node:readline";

/* ----------------------- non-interactive (piped) ----------------------- */
// When stdin is piped, EOF can close a readline interface before a second
// prompt is registered. So we read ALL of stdin once and serve lines from a
// buffer, which works for any number of sequential prompts.
let bufferedLines: string[] | null = null;
let bufferedIdx = 0;
let loadPromise: Promise<void> | null = null;

function loadPipedInput(): Promise<void> {
  if (bufferedLines) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => {
      bufferedLines = data.split(/\r?\n/);
      resolve();
    });
    process.stdin.resume();
  });
  return loadPromise;
}

async function askPiped(question: string): Promise<string> {
  process.stdout.write(question);
  await loadPipedInput();
  const line = bufferedLines![bufferedIdx++] ?? "";
  process.stdout.write("\n");
  return line.trim();
}

/* --------------------------- interactive TTY --------------------------- */
let sharedRl: Interface | null = null;

export function closePrompt() {
  sharedRl?.close();
  sharedRl = null;
}

/** Read a line of visible input. */
export function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return askPiped(question);
  if (!sharedRl) {
    sharedRl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return new Promise((resolve) => {
    sharedRl!.question(question, (answer) => resolve(answer.trim()));
  });
}

/** Read a line of input without echoing it to the terminal (for passwords). */
export function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return askPiped(question);

  return new Promise((resolve) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (ch === "\n" || ch === "\r" || code === 4 /* EOT */) {
          cleanup();
          process.stdout.write("\n");
          return resolve(value);
        } else if (code === 3 /* Ctrl-C */) {
          cleanup();
          process.stdout.write("\n");
          process.exit(1);
        } else if (code === 127 || code === 8 /* Backspace */) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (code >= 32) {
          value += ch;
          process.stdout.write("*");
        }
      }
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    stdin.on("data", onData);
  });
}
