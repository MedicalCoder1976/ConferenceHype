import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConferenceHype",
  description: "Interactive AI commentary for people following medical conferences.",
  metadataBase: new URL("https://conferencehype.com"),
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "ConferenceHype",
    description:
      "Interactive AI commentary for medical-conference topic suggestions, social signals, and follow-along listening.",
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
