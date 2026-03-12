import { createInterface } from "node:readline";

export async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export async function selectOne(
  message: string,
  items: string[]
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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
