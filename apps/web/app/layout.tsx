import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solutio Installments',
  description: 'Track property installment plans',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
