import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import ChatInterface from "@/components/ChatInterface";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Eskwelabs AI Advisor",
  description: "EIF AI Advisor with RAG-grounded mentoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="system" storageKey="advisor-theme">
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="beforeInteractive"
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
