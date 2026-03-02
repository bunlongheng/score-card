"use client";

import { useEffect } from "react";

export default function VisitorTracker() {
    useEffect(() => {
        const track = () => {
            try {
                const fingerprint = [
                    navigator.userAgent,
                    navigator.language,
                    screen.colorDepth,
                    new Date().getTimezoneOffset(),
                ].join("|");

                fetch("https://www.bunlongheng.com/api/v", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        path: "/score-card",
                        referrer: document.referrer || "",
                        fingerprint,
                        screen_width: screen.width,
                        screen_height: screen.height,
                    }),
                }).catch(() => {});
            } catch {
                // silently ignore
            }
        };

        if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(track, { timeout: 3000 });
        } else {
            setTimeout(track, 3000);
        }
    }, []);

    return null;
}
