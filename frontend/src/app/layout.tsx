
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/aqualedger/app-shell";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans, Noto_Sans_Arabic } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// "Borewell gauge" type system: a characterful display face for headings,
// a calm grotesk for reading text, and a mono face for depth figures.
const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const data = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const display = Bricolage_Grotesque({
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
    { media: "(prefers-color-scheme: light)", color: "#f4f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#061114" },
  ],
};

export const metadata: Metadata = {
  title: "AquaLedger | Groundwater Intelligence",
  description: "Pakistan's Underground Water Intelligence System",
  applicationName: "AquaLedger",
  icons: {
    icon: "/aqualedger-logo.png",
    apple: "/aqualedger-logo.png",
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
      className={`${body.variable} ${data.variable} ${display.variable} ${notoUrdu.variable} h-full antialiased`}
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
