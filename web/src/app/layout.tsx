import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/Providers";
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
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <ChatInterface />
          {children}
        </Providers>
      </body>
    </html>
  );
}
