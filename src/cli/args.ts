export interface ParsedArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { _: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = camelCase(arg.slice(2, eqIndex));
        result[key] = arg.slice(eqIndex + 1);
      } else {
        const key = camelCase(arg.slice(2));
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          result[key] = next;
          i++;
        } else {
          result[key] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }

  return result;
}

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
