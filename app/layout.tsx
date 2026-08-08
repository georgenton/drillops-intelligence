import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./screens.css";

export const metadata: Metadata = {
  title: "DrillOps Intelligence",
  description: "Inteligencia operacional para perforación diamantina",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
