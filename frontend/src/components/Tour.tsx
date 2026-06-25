import { useState } from "react";

const TOUR_KEY = "chargeebee_tour_done";

export function tourDone(): boolean {
  return localStorage.getItem(TOUR_KEY) === "1";
}
export function resetTour() {
  localStorage.removeItem(TOUR_KEY);
}

interface Step {
  icon: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: "👋",
    title: "Welcome to your billing dashboard",
    body: "A quick 30-second tour of what you can do here. You can skip anytime.",
  },
  {
    icon: "🧪",
    title: "Test & Live modes",
    body: "Use the Test/Live toggle (top-left) to switch worlds. Test is a sandbox with separate data; Live is real money. They never mix.",
  },
  {
    icon: "📦",
    title: "Products & Plans",
    body: "Define what you sell and how it's priced — monthly, yearly, with trials. Plans are what customers subscribe to.",
  },
  {
    icon: "👥",
    title: "Customers & Subscriptions",
    body: "Add customers and subscribe them to a plan. The billing engine charges them automatically each cycle and handles failed-payment retries (dunning).",
  },
  {
    icon: "🛒",
    title: "Hosted Checkout",
    body: "Generate a branded payment link — or call the API — so customers can subscribe and pay. Cards are vaulted by the gateway; you stay out of PCI scope.",
  },
  {
    icon: "🔌",
    title: "Developers",
    body: "Connect your gateway (Stripe, Razorpay, …), set up signed Webhooks, and create API keys. Full reference lives in API Docs.",
  },
  {
    icon: "🎉",
    title: "You're all set!",
    body: "Start by adding a product, then a plan, then a customer. You can replay this tour anytime from Settings.",
  },
];

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  function finish() {
    localStorage.setItem(TOUR_KEY, "1");
    onClose();
  }

  return (
    <div className="tour-overlay">
      <div className="tour-card">
        <button className="tour-skip" onClick={finish}>
          Skip tour
        </button>

        <div className="tour-icon">{step.icon}</div>
        <h2 className="tour-title">{step.title}</h2>
        <p className="tour-body">{step.body}</p>

        <div className="tour-dots">
          {STEPS.map((_, n) => (
            <span key={n} className={n === i ? "tour-dot active" : "tour-dot"} />
          ))}
        </div>

        <div className="tour-actions">
          {i > 0 ? (
            <button className="btn-ghost" style={{ width: "auto" }} onClick={() => setI(i - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          {isLast ? (
            <button className="btn btn-sm" onClick={finish}>
              Get started
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => setI(i + 1)}>
              Next ({i + 1}/{STEPS.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
