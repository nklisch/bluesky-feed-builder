import { defineConfig } from "drizzle-kit";
import process from "node:process";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
