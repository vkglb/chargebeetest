import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/products", label: "Products & Plans" },
  { to: "/customers", label: "Customers" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/gateways", label: "Payment Gateways" },
];

export default function Layout() {
  const { logout, merchantId, isGuest } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">⚡ Billing</div>
        {isGuest && <div className="demo-pill">Demo mode</div>}
        <nav>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              {item.label}
            </NavLink>
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
        <Outlet />
      </main>
    </div>
  );
}
