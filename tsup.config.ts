import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
    "adapters/index": "src/adapters/index.ts",
    "core/index": "src/core/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: true,
  external: [
    "react",
    "react-dom",
    "@chakra-ui/react",
    "@powerduck/openapi-parser",
  ],
  injectStyle: false,
});
