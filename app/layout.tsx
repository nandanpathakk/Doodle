import type { Metadata } from "next";
import { Architects_Daughter, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const architectsDaughter = Architects_Daughter({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-hand",
});

export const metadata: Metadata = {
  title: "Doodle",
  description:
    "A hand-drawn whiteboard for sketching, planning, and thinking out loud — on your own, or with other people in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          architectsDaughter.variable
        )}
      >
        {children}
      </body>
    </html>
  );
}
