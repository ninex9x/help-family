import type { Metadata, Viewport } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/material-symbols-outlined/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "help-family — Gestão de Saúde",
  description: "Agenda e histórico de medicamentos para cuidar da rotina de toda a família.",
  applicationName: "help-family",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "help-family",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

const themeInitializer = `
(() => {
  try {
    const savedTheme = window.localStorage.getItem("cura-family-theme");
    const theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0f0f0f" : "#f4f1ea");
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#f4f1ea" />
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
