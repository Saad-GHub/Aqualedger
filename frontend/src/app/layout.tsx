
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/aqualedger/app-shell";
import { Geist, Geist_Mono, Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const notoUrdu = Noto_Sans_Arabic({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf2f5" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  title: "AquaLedger | Groundwater Intelligence",
  description: "Pakistan's Underground Water Intelligence System",
  applicationName: "AquaLedger",
  icons: {
    icon: "/aqualedger-logo.jpg",
    apple: "/aqualedger-logo.jpg",
  },
  // iPhone / iPad: full-screen when added to the Home Screen, status bar over the page.
  appleWebApp: { capable: true, title: "AquaLedger", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, address: false, email: false },
};

// Applies the saved (or system) theme and language before first paint so the page never flashes.
const themeScript = `try{var t=localStorage.getItem("aqua-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark");var l=localStorage.getItem("aqua-lang");var isUr=l==="ur";document.documentElement.lang=isUr?"ur":"en";document.documentElement.dir=isUr?"rtl":"ltr"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${notoUrdu.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
        <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
