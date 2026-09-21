import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Dream Destination',
    template: '%s · Dream Destination',
  },
  description:
    'Describe a trip, compare suitable destinations, build an itinerary within budget, and carry the essential plan offline.',
  applicationName: 'Dream Destination',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Dream Destination', statusBarStyle: 'default' },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#17324D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;450;650;700;800&family=Noto+Sans+Tamil:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
