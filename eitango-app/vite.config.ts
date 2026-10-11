import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ビルド結果は ../eitango/ に出力され、GitHub Pages で
// https://yusakunagano.github.io/squiddessert/eitango/ として公開される
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../eitango",
    emptyOutDir: true,
  },
});
