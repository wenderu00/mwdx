import "server-only";
import path from "node:path";

// Raiz do monorepo. `pnpm --filter @mwdx/dashboard dev|start` roda em apps/dashboard.
export const RAIZ = process.env.MWDX_RAIZ ?? path.resolve(process.cwd(), "../..");
