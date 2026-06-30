import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { api, isGuest } from "../api/client";

const TOUR_KEY = "chargeebee_tour_done";

export function tourDone(): boolean {
  return localStorage.getItem(TOUR_KEY) === "1";
}
export function resetTour() {
  localStorage.removeItem(TOUR_KEY);
}

// Spotlight product tour: dims the screen and highlights real UI elements with
// popovers, like the onboarding tours on polished SaaS apps.
export default function Tour({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      localStorage.setItem(TOUR_KEY, "1"); // fast local cache
      // Persist server-side so a cleared localStorage won't restart the tour.
      if (!isGuest()) {
        api.post("/v1/me/tour/complete").catch(() => {});
      }
      onClose();
    };

    const d = driver({
      showProgress: true,
      animate: true,
      overlayColor: "rgba(0,0,0,0.75)",
      nextBtnText: "Next →",
      prevBtnText: "← Back",
      doneBtnText: "Get started",
      onDestroyed: finish,
      steps: [
        {
          popover: {
            title: "👋 Welcome to your billing dashboard",
            description:
              "A quick tour of what you can do here. You can skip anytime with Esc or the × button.",
          },
        },
        {
          element: ".mode-toggle",
          popover: {
            title: "🧪 Test & Live modes",
            description:
              "Switch between a safe sandbox (Test) and real money (Live). Each has its own data and gateway keys — they never mix.",
            side: "right",
            align: "start",
          },
        },
        {
          element: '[data-tour="products"]',
          popover: {
            title: "📦 Products & Plans",
            description: "Define what you sell and how it's priced — monthly, yearly, with trials.",
            side: "right",
            align: "start",
          },
        },
        {
          element: '[data-tour="subscriptions"]',
          popover: {
            title: "👥 Subscriptions",
            description:
              "Subscribe customers to a plan. The billing engine charges them each cycle and retries failed payments (dunning).",
            side: "right",
            align: "start",
          },
        },
        {
          element: '[data-tour="checkout"]',
          popover: {
            title: "🛒 Hosted Checkout",
            description:
              "Generate a branded payment link or use the API. Cards are vaulted by the gateway — you stay out of PCI scope.",
            side: "right",
            align: "start",
          },
        },
        {
          element: '[data-tour="webhooks"]',
          popover: {
            title: "🔌 Webhooks & API",
            description:
              "Get signed events in real time, manage API keys, and read the full reference in API Docs.",
            side: "right",
            align: "start",
          },
        },
        {
          popover: {
            title: "🎉 You're all set!",
            description:
              "Start by adding a product, then a plan, then a customer. Replay this tour anytime from Settings → Help.",
          },
        },
      ],
    });

    d.drive();
    return () => {
      if (!finished) {
        finished = true;
        d.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
