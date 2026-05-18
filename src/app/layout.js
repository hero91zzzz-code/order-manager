export const metadata = {
  title: 'DAY',
  description: '주문서 관리 시스템',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DAY" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#f6f5f1' }}>
        {children}
      </body>
    </html>
  );
}
