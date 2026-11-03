import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { getViewer } from "@/lib/auth";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--f-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Quiz Desk",
  description: "Practice quizzes made from class study guides.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <ClerkProvider>
      <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <body>
          <div className="wrap">
            <header className="top">
              <Link href="/" className="brand"><b>Quiz <span>Desk</span></b></Link>
              <SignedIn>
                <div className="row">
                  {viewer?.isParent && (
                    <nav className="tabs">
                      <Link href="/">Quizzes</Link>
                      <Link href="/parent">Parent</Link>
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
