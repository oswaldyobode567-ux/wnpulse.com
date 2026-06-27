/**
 * PageTracker — sends page-view events to PostHog (already installed in index.html)
 * and Google Analytics 4 if `window.gtag` is present.
 *
 * Mounted once at the root inside <BrowserRouter>, watches route changes
 * and fires both pageviews + structured events.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;

    // PostHog
    if (typeof window !== "undefined" && window.posthog) {
      try {
        window.posthog.capture("$pageview", {
          $current_url: window.location.href,
          path,
        });
      } catch (_e) {
        /* posthog optional */
      }
    }

    // Google Analytics 4 (only fires if gtag is present)
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      try {
        window.gtag("event", "page_view", {
          page_path: path,
          page_location: window.location.href,
          page_title: document.title,
        });
      } catch (_e) {
        /* gtag optional */
      }
    }
  }, [location.pathname, location.search]);

  return null;
}
