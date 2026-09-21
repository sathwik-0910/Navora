import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Navora | Adaptive AV Navigation & Collision Avoidance (SIH 26038)",
  description:
    "Smart India Hackathon Prototype: Adaptive Path Planning and Collision Avoidance for Autonomous Vehicles on Unstructured Indian Roads",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" data-theme="night">
      <head>
        {/* Prevent flash of wrong theme on initial load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.setAttribute('data-theme', localStorage.getItem('navora-theme') || 'night');`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col font-sans antialiased`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        {children}
      </body>
    </html>
  );
}
