import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RateDestinations — honest city guides, rated by locals and travellers",
    template: "%s · RateDestinations",
  },
  description:
    "One honest guide per city: the restaurants, parks and sights worth your time, and the places, scams and streets to avoid. Rated by locals and travellers.",
  openGraph: { type: "website", siteName: "RateDestinations" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<SiteHeader user={null} />}>
          <SiteHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
