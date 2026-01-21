import "./globals.css"
import type { ReactNode } from "react"
import { AppToaster } from "@/components/providers/app-toaster"
import { HeaderProvider } from "@/components/nav/header-provider"
import { GlobalLoader } from "@/components/global-loader"
import { XpCelebrationOverlay } from "@/components/gamification/xp-celebration"
import { DailyLoginPing } from "@/components/daily-login-ping"

export const metadata = { title: "Jarvis", description: "Personalized analytics learning" };

// Mark the root layout as dynamic since the header reads auth cookies/session
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <XpCelebrationOverlay />
        <GlobalLoader />
        <HeaderProvider />
        <DailyLoginPing />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
