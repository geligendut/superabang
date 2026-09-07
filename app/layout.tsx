import './globals.css';
import type { Metadata } from 'next';
import { ServiceWorkerRegistration } from '@/src/ui/ServiceWorkerRegistration';
import { NetworkStatus } from '@/src/ui/NetworkStatus';

export const metadata: Metadata = {
  title: 'Superabang',
  description: 'Personal Fitness & Performance',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Superabang', statusBarStyle: 'default' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <NetworkStatus />
        {children}
      </body>
    </html>
  );
}
