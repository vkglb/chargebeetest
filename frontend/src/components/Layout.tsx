import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, getMode, setMode, type Me, type Mode } from "../api/client";
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

const COLLAPSE_KEY = "chargeebee_nav_collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

export default function Layout() {
  const { logout, merchantId, isGuest } = useAuth();
  const navigate = useNavigate();
  const [showTour, setShowTour] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [theme, setTheme] = useState(() => localStorage.getItem("chargeebee_theme") || "dark");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light-theme");
    } else {
      root.classList.remove("light-theme");
    }
    localStorage.setItem("chargeebee_theme", theme);
  }, [theme]);

  function getGreeting() {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning 🌅";
    if (hr < 17) return "Good afternoon ☀️";
    return "Good evening 🌙";
  }

  // Decide whether to auto-open the product tour. For real accounts the
  // "completed" flag lives in the database (survives a cleared localStorage);
  // guests (and a not-yet-deployed backend) fall back to the localStorage flag.
  useEffect(() => {
    if (isGuest) {
      setShowTour(!tourDone());
      return;
    }
    api
      .get<Me>("/v1/me")
      .then((me) => {
        setShowTour(!me.tour_completed);
        if (me.two_factor_enabled) {
          localStorage.setItem("chargeebee_2fa_enabled", "true");
        } else {
          localStorage.removeItem("chargeebee_2fa_enabled");
        }
      })
      .catch(() => setShowTour(!tourDone()));
  }, [isGuest]);

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });
  }

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
        <button
          className={`mode-cta ${current}`}
          onClick={() => switchMode(current === "test" ? "live" : "test")}
        >
          {current === "test" ? "Switch to Live mode →" : "← Switch to Test mode"}
        </button>
        <nav>
          {navGroups.map((group, gi) => {
            const isCollapsed = !!group.title && collapsed[group.title];
            return (
              <div key={gi} className="nav-group">
                {group.title && (
                  <button
                    className="nav-group-title"
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={!isCollapsed}
                  >
                    <span>{group.title}</span>
                    <svg
                      className={`nav-chevron ${isCollapsed ? "collapsed" : ""}`}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {!isCollapsed &&
                  group.items.map((item) => (
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
            );
          })}
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
        <header className="content-header">
          <div>
            <h2 className="header-greeting">{getGreeting()}</h2>
            <p className="header-sub">Here is what is happening today.</p>
          </div>
          <div className="header-controls">
            <div className="theme-switch-wrapper">
              <span className="theme-icon">{theme === "light" ? "☀️" : "🌙"}</span>
              <label className="theme-switch">
                <input
                  type="checkbox"
                  checked={theme === "light"}
                  onChange={() => setTheme(theme === "light" ? "dark" : "light")}
                />
                <span className="theme-slider"></span>
              </label>
            </div>
          </div>
        </header>

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
