import "./globals.css";

export const metadata = {
  title: "Budget famille",
  description: "Budget et simulation à 2 ans, partagés en famille",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#065f46",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
