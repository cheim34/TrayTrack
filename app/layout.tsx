import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrayTrack",
  description: "Collaborative tray management for medical device territories",
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
