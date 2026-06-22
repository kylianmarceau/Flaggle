import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Needle Drop",
  description: "A genre-based song snippet guessing game.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
