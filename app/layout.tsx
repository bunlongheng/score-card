import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#000000",
};

export const metadata: Metadata = {
    title: "Score Card",
    description: "Interview score card — structured rubric for technical interviews",
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
                {children}
            </body>
        </html>
    );
}
