import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BracketBuilder",
  description:
    "Research-seeded brackets for any category, voted on by the people you invite.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</div>
      </body>
    </html>
  );
}
