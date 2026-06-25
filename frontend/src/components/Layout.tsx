import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getMode, setMode, type Mode } from "../api/client";
import Tour, { tourDone } from "./Tour";

// Maps nav labels to tour anchor ids (driver.js highlights these elements).
const TOUR_IDS: Record<string, string> = {
  "Products & Plans": "products",
  Subscriptions: "subscriptions",
  "Hosted Checkout": "checkout",
  Webhooks: "webhooks",
  "API Keys": "apikeys",
};

const navGroups = [
  {
    title: "",
    items: [
      { to: "/", label: "Overview", end: true },
      { to: "/analytics", label: "Analytics" },
    ],
  },
  {
    title: "Billing",
    items: [
      { to: "/products", label: "Products & Plans" },
      { to: "/customers", label: "Customers" },
      { to: "/subscriptions", label: "Subscriptions" },
      { to: "/checkouts", label: "Hosted Checkout" },
      { to: "/invoices", label: "Invoices" },
      { to: "/transactions", label: "Transactions" },
      { to: "/coupons", label: "Coupons" },
    ],
  },
  {
    title: "Developers",
    items: [
      { to: "/gateways", label: "Payment Gateways" },
      { to: "/webhooks", label: "Webhooks" },
      { to: "/api-keys", label: "API Keys" },
      { to: "/docs", label: "API Docs" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

export default function Layout() {
  const { logout, merchantId, isGuest } = useAuth();
  const navigate = useNavigate();
  const [showTour, setShowTour] = useState(!tourDone());

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const current = getMode();
  function switchMode(m: Mode) {
    if (m === current) return;
    setMode(m);
    // Reload so every page re-fetches its data for the selected mode.
    window.location.reload();
  }

  return (
    <div className="app-shell">
      {showTour && <Tour onClose={() => setShowTour(false)} />}
      <aside className="sidebar">
        <div className="brand">⚡ Billing</div>
        {isGuest && <div className="demo-pill">Demo mode</div>}

        <div className={`mode-toggle ${current}`}>
          <button
            className={current === "test" ? "active" : ""}
            onClick={() => switchMode("test")}
          >
            Test
          </button>
          <button
            className={current === "live" ? "active" : ""}
            onClick={() => switchMode("live")}
          >
            Live
          </button>
        </div>
        <nav>
          {navGroups.map((group, gi) => (
            <div key={gi} className="nav-group">
              {group.title && <div className="nav-group-title">{group.title}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  data-tour={TOUR_IDS[item.label]}
                  className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="merchant-id" title={merchantId ?? ""}>
            {merchantId ? `Merchant ${merchantId.slice(0, 8)}…` : ""}
          </div>
          <button className="btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <div className={`mode-banner ${current}`}>
          <span className="mode-dot" />
          {current === "live" ? (
            <span>
              <strong>LIVE mode</strong> — actions here affect real customers and real money.
            </span>
          ) : (
            <span>
              <strong>TEST mode</strong> — a sandbox with separate data. No real charges are made.
            </span>
          )}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
