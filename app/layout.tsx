import type { Metadata, Viewport } from "next";
import "./globals.css";
import VisitorTracker from "@/components/VisitorTracker";

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#000000",
};

export const metadata: Metadata = {
    title: "Score Card",
    description: "Interview score card — structured rubric for technical interviews",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
        apple: "/favicon.svg",
    },
    openGraph: {
        title: "Score Card",
        description: "Interview score card — structured rubric for technical interviews",
        type: "website",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="antialiased bg-black text-white">
                <VisitorTracker />
                {children}
            </body>
        </html>
    );
}
