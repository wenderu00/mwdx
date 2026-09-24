import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/tabelas.ts",
  out: "./drizzle",
});
