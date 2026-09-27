import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
const root = process.env.IMD_DEPENDENCIES || process.cwd();
const require = createRequire(resolve(root, "package.json"));
const [command, ...args] = process.argv.slice(2);
if (command === "typecheck") {
  const ts = require("typescript");
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  if (config.error) {
    console.error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
    process.exit(1);
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    process.cwd(),
  );
  if (process.env.IMD_DEPENDENCIES) {
    const reactTypes = dirname(require.resolve("@types/react/package.json"));
    const domTypes = dirname(require.resolve("@types/react-dom/package.json"));
    parsed.options.paths = {
      react: [resolve(reactTypes, "index.d.ts")],
      "react/*": [resolve(reactTypes, "*")],
      "react-dom/*": [resolve(domTypes, "*")],
    };
    parsed.options.typeRoots = [resolve(root, "node_modules/@types")];
  }
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length)
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => process.cwd(),
        getCanonicalFileName: (f) => f,
        getNewLine: () => "\n",
      }),
    );
  else console.log("Typecheck passed (TypeScript, strict, no emit).");
  process.exit(diagnostics.length ? 1 : 0);
}
const binary = resolve(
  dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);
const result = spawnSync(
  process.execPath,
  [binary, ...args, "--configLoader", "runner"],
  {
    stdio: "inherit",
    env: process.env,
  },
);
process.exit(result.status ?? 1);
