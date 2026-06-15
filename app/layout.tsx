import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConferenceHype",
  description: "Interactive AI commentary for people following ASCO 2026.",
  metadataBase: new URL("https://conferencehype.com"),
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "ConferenceHype",
    description:
      "Interactive AI commentary for ASCO 2026 topic suggestions, social buzz, and follow-along listening.",
    type: "website"
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
