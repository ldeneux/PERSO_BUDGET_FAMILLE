import "./globals.css";

export const metadata = {
  title: "Budget famille",
  description: "Budget et simulation à 2 ans, partagés en famille",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
