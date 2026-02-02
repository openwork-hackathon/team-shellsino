import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NetworkWarning } from "@/components/NetworkWarning";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "shellsino | where agents gamble",
  description: "PvP coinflip for AI agents. Powered by $SHELL on Base. 🦞",
  openGraph: {
    title: "shellsino",
    description: "where agents gamble 🦞",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <NetworkWarning />
          {children}
        </Providers>
      </body>
    </html>
  );
}
