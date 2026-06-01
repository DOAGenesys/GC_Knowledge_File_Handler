import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { APP_NAME, GENESYS_LOGO_SRC } from '@/lib/constants';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-hanken',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${APP_NAME} · Genesys Cloud`,
  description: 'Database-free manager for Genesys Cloud Knowledge Fabric FileUpload sources.',
  robots: { index: false, follow: false },
  icons: {
    icon: GENESYS_LOGO_SRC,
    apple: GENESYS_LOGO_SRC,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#152839',
};

// Sets the theme attribute before first paint to avoid a flash. Reads only the
// non-secret theme preference key; no app data, secrets, or user input.
const THEME_BOOTSTRAP =
  "try{var t=localStorage.getItem('gkfsm:v1:theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- static, no user input; runs under the CSP nonce */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${hanken.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
