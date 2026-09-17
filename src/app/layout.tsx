import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wynn & Reya - Container Verification System',
  description: 'Secure Invoice and Container Tracking Number Verification Slice',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
