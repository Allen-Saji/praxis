import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
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

// Production origin. Drives absolute URLs for OG/Twitter images and canonical.
// Update if the deployed domain differs.
const SITE_URL = "https://praxis.allensaji.dev";

const TITLE = "Praxis - a safety layer between your AI agent and its wallet";
const DESCRIPTION =
  "Praxis simulates and risk-scores every spend before it signs, and writes the reasoning to a verifiable on-chain audit trail. Testnet, Sui only in v1.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Praxis",
  keywords: [
    "Praxis",
    "Sui",
    "AI agents",
    "agent wallet security",
    "transaction simulation",
    "risk scoring",
    "Walrus",
    "Seal",
    "on-chain audit trail",
  ],
  authors: [{ name: "Allen Saji", url: "https://allensaji.dev" }],
  creator: "Allen Saji",
  alternates: { canonical: SITE_URL },
  // og:image and twitter:image are supplied by app/opengraph-image.png and
  // app/twitter-image.png; icons by app/icon.png and app/apple-icon.png.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Praxis",
    title: TITLE,
    description:
      "Simulate and risk-score every spend before it signs. Write the reasoning to a verifiable on-chain audit trail.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Simulate and risk-score every spend before it signs. Write the reasoning to a verifiable on-chain audit trail.",
    creator: "@SajiBhai011",
  },
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
      <body>{children}</body>
    </html>
  );
}
