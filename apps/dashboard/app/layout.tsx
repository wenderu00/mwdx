import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "mwdx" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <nav className="nav">
          <Link href="/" className="marca">
            mwdx
          </Link>
          <Link href="/">repos</Link>
          <Link href="/quick-wins">quick-wins</Link>
          <Link href="/portfolio">portfólio</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
