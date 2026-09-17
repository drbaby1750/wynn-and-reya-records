import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wynn & Reya Records',
  description: 'Secure Record Management and Access Control System',
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
