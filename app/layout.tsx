import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { I18nProvider } from "@/lib/i18n/context"
import { AuthProvider } from "@/lib/auth-context"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "DartMaster Pro - Multiplayer Darts Scorer",
  description: "Real-time scoring for darts games with support for 301 and 501 game types",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DartMaster",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  themeColor: "#1e40af",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <I18nProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </I18nProvider>
        <Analytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  if (${JSON.stringify(process.env.NODE_ENV)} === 'production') {
                    navigator.serviceWorker.register('/sw.js');
                  } else {
                    Promise.all([
                      navigator.serviceWorker.getRegistrations().then(function(registrations) {
                        return Promise.all(
                          registrations.map(function(registration) {
                            return registration.unregister();
                          })
                        );
                      }),
                      ('caches' in window)
                        ? caches.keys().then(function(keys) {
                            return Promise.all(keys.map(function(key) { return caches.delete(key); }));
                          })
                        : Promise.resolve(),
                    ]).finally(function() {
                      // If this page was controlled by an old SW, reload once without it.
                      if (navigator.serviceWorker.controller && !sessionStorage.getItem('sw-dev-cleaned')) {
                        sessionStorage.setItem('sw-dev-cleaned', '1');
                        location.reload();
                      }
                    });
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
