import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { GradientField } from "@/components/visual/GradientField";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Display face for the Praxis wordmark only.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Praxis - a safety layer between your AI agent and its wallet",
  description:
    "Praxis simulates and risk-scores every spend before it signs, and writes the reasoning to an audit trail. Testnet, SUI only in v1.",
  metadataBase: new URL("https://praxis.local"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <GradientField />
        <div className="grain relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
