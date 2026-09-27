import { createRequire } from "node:module";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const require = createRequire(
  resolve(process.env.IMD_DEPENDENCIES || process.cwd(), "package.json"),
);
export default {
  base: "./",
  cacheDir: resolve(
    tmpdir(),
    "imd-signal-vite",
    createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12),
  ),
  resolve: {
    alias: {
      "react-dom/client": require.resolve("react-dom/client"),
      "react/jsx-runtime": require.resolve("react/jsx-runtime"),
      "react/jsx-dev-runtime": require.resolve("react/jsx-dev-runtime"),
      react: require.resolve("react"),
      "react-dom": require.resolve("react-dom"),
    },
  },
};
