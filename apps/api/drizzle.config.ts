/** Drizzle Kit 설정 — src/db/schema.ts에서 migrations/ SQL을 생성한다. */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
