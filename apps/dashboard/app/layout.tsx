import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "mwdx" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
