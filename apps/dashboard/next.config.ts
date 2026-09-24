import type { NextConfig } from "next";

const config: NextConfig = {
  // Módulo nativo: fica fora do bundle. Os pacotes do workspace (@mwdx/db,
  // @mwdx/schema) são empacotados; por isso lib/db.ts passa a pasta de migrações.
  serverExternalPackages: ["better-sqlite3"],
  // A checagem de tipos é o `pnpm typecheck` (TypeScript 7), não a do next build.
  typescript: { ignoreBuildErrors: true },
};

export default config;
