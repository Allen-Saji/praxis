import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { RouteHistory } from "@/components/navigation/RouteHistory";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL, SOCIAL_HANDLE } from "@/lib/brand";
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
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Praxis",
  keywords: [
    "Praxis",
    "Praxis Guard",
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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: SOCIAL_HANDLE,
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
      <body>
        <RouteHistory />
        {children}
      </body>
    </html>
  );
}
