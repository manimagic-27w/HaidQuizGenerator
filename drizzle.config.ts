import { defineConfig } from "drizzle-kit";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// drizzle-kit talks to Neon over a WebSocket; older Node versions don't have one built in.
neonConfig.webSocketConstructor = ws;

// Read DATABASE_URL from .env.local (or .env) so `npm run db:push` needs no extra typing.
for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* file not present */ }
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env.local (see README) or run `vercel env pull .env.local`.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
