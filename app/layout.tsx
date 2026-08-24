import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from './register-sw';

export const metadata: Metadata = {
  title: 'Receipt Tracker',
  description: 'Track and manage your receipts',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Receipts', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#4338CA',
  width: 'device-width',
  initialScale: 1,
  // The form is filled in one-handed on a phone; letting iOS/Android zoom on
  // focus is fine, so no maximum-scale lock.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
