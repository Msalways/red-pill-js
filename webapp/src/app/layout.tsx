import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Redpill JS SDK - Chart Generator",
  description: "AI-powered chart generation using JavaScript SDK",
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
