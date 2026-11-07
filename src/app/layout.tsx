import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import { getViewer } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quiz Desk",
  description: "Practice quizzes made from class study guides.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" />
        </head>
        <body>
          <div className="wrap">
            <header className="top">
              <Link href="/" className="brand"><b>Quiz <span>Desk</span></b></Link>
              <SignedIn>
                <div className="row">
                  {(viewer?.isParent || viewer?.isAdmin) && (
                    <nav className="tabs">
                      {viewer.familyId && <Link href="/">Quizzes</Link>}
                      {viewer.isParent && <Link href="/parent">Parent</Link>}
                      {viewer.isAdmin && <Link href="/admin">Families</Link>}
                    </nav>
                  )}
                  <UserButton />
                </div>
              </SignedIn>
            </header>
            <main>{children}</main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
