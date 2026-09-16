import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DROPKE | Fortnite credit for Kenyan gamers',
  description: 'Fortnite credit for PlayStation, Xbox, Nintendo and PC. Pay in KSh and redeem on your own account.',
  applicationName: 'DROPKE',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DROPKE | Top up. Drop in.',
    description: 'Kenya-first Fortnite credit storefront.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
