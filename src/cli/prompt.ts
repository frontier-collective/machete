import { createInterface, type Interface } from "node:readline";

/**
 * Create a readline interface that exits cleanly on Ctrl+C.
 *
 * Readline puts the terminal in raw mode, so Ctrl+C is intercepted as a
 * character (0x03) rather than generating a real SIGINT signal. This means
 * process.on("SIGINT") never fires while a readline is active. Readline
 * emits its own "SIGINT" event on the rl instance — if nobody listens,
 * it just pauses input and the process hangs. This factory wires up the
 * handler so every caller gets clean exit behaviour for free.
 *
 * The process.on("SIGINT") in index.ts covers Ctrl+C outside of readline
 * (e.g. during API calls or git commands).
 */
export function createRl(): Interface {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    console.log();
    process.exit(0);
  });

  return rl;
}

export async function confirm(message: string, defaultYes = false): Promise<boolean> {
  const rl = createRl();
  const hint = defaultYes ? "(Y/n)" : "(y/N)";

  return new Promise((resolve) => {
    rl.question(`${message} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultYes);
        return;
      }
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

export async function selectOne(
  message: string,
  items: string[]
): Promise<string> {
  const rl = createRl();

  console.log(`\n${message}\n`);
  for (let i = 0; i < items.length; i++) {
    console.log(`  ${i + 1}) ${items[i]}`);
  }
  console.log();

  return new Promise((resolve) => {
    rl.question("Select [1]: ", (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === "") {
        resolve(items[0]);
        return;
      }
      const index = parseInt(trimmed, 10) - 1;
      if (index >= 0 && index < items.length) {
        resolve(items[index]);
      } else {
        resolve(items[0]);
      }
    });
  });
}

export async function selectMultiple(
  message: string,
  items: string[]
): Promise<string[]> {
  const rl = createRl();

  console.log(`\n${message}\n`);
  for (let i = 0; i < items.length; i++) {
    console.log(`  ${i + 1}) ${items[i]}`);
  }
  console.log();

  return new Promise((resolve) => {
    rl.question(
      "Enter numbers to select (comma-separated, or 'all'): ",
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();

        if (trimmed === "all") {
          resolve(items);
          return;
        }

        if (trimmed === "" || trimmed === "none") {
          resolve([]);
          return;
        }

        const indices = trimmed
          .split(",")
          .map((s) => parseInt(s.trim(), 10) - 1)
          .filter((i) => i >= 0 && i < items.length);

        resolve(indices.map((i) => items[i]));
      }
    );
  });
}
