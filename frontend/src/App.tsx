import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Overview from "./pages/Overview";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Subscriptions from "./pages/Subscriptions";
import Gateways from "./pages/Gateways";
import Coupons from "./pages/Coupons";
import Invoices from "./pages/Invoices";
import Transactions from "./pages/Transactions";
import Webhooks from "./pages/Webhooks";
import ApiKeys from "./pages/ApiKeys";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Checkouts from "./pages/Checkouts";
import Checkout from "./pages/Checkout";
import Docs from "./pages/Docs";
import Sites from "./pages/Sites";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* Public hosted checkout page (no auth — the customer lands here) */}
      <Route path="/checkout/:id" element={<Checkout />} />
      {/* Post-login site selector (auth, but standalone — no dashboard chrome) */}
      <Route
        path="/sites"
        element={
          <ProtectedRoute>
            <Sites />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="/products" element={<Products />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/checkouts" element={<Checkouts />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/gateways" element={<Gateways />} />
        <Route path="/webhooks" element={<Webhooks />} />
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
