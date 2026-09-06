import Script from 'next/script';
import LegacyScripts from './legacy-scripts';
import '../styles/style.css';
import '../styles/info-style.css';
import '../styles/blog-style.css';
import '../styles/blog-post-style.css';
import '../styles/admin-style.css';

export const metadata = {
    title: 'CarnegienFreedom | Plan, Earn, and Live Free',
    description: 'CarnegienFreedom helps you plan, earn, and live free through practical financial-freedom education and scam-aware guidance.',
    icons: { icon: '/images/favicon.svg' },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
                />
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                />
            </head>
            <body>
                {children}
                <Script src="/scripts/script.js" strategy="afterInteractive" />
                <LegacyScripts />
            </body>
        </html>
    );
}
