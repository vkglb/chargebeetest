import { useEffect, useState } from "react";
import { api, type GatewayAccount } from "../api/client";
import { formatDate } from "../lib/format";
import Modal from "../components/Modal";

// The catalogue of gateways the platform can integrate. All are connectable;
// each has a real backend implementation behind the PaymentGateway interface.
const CATALOG = [
  {
    provider: "stripe",
    name: "Stripe",
    blurb: "Cards, wallets, SCA, Connect",
    refLabel: "Account ref (acct_… optional)",
    secretLabel: "Secret key (sk_test_…)",
    pubLabel: "Publishable key (pk_test_…)",
  },
  {
    provider: "razorpay",
    name: "Razorpay",
    blurb: "India — UPI, cards, netbanking",
    refLabel: "Account ref (optional)",
    secretLabel: "key_id:key_secret",
  },
  {
    provider: "braintree",
    name: "Braintree",
    blurb: "PayPal-owned, global cards",
    refLabel: "Merchant ID (optional)",
    secretLabel: "public_key:private_key",
  },
  {
    provider: "paypal",
    name: "PayPal",
    blurb: "PayPal balance & cards",
    refLabel: "Account ref (optional)",
    secretLabel: "client_id:secret",
  },
];

export default function Gateways() {
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [accountRef, setAccountRef] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  async function load() {
    const res = await api.get<GatewayAccount[]>("/v1/gateways");
    setAccounts(res ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const connected = (provider: string) => accounts.find((a) => a.provider === provider);

  function openForm(provider: string) {
    setAccountRef("");
    setSecretKey("");
    setPublishableKey("");
    setConnecting(provider);
  }

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function connect(provider: string) {
    setError("");
    const g = CATALOG.find((x) => x.provider === provider);
    if (!secretKey.trim()) {
      setError(`${g?.name ?? "Gateway"} requires a secret credential to connect.`);
      return;
    }
    setIsSaving(provider);
    try {
      await delay(1500); // 1.5s authentic connecting delay
      await api.post("/v1/gateways", {
        provider,
        account_ref: accountRef,
        secret_key: secretKey.trim(),
        publishable_key: publishableKey.trim(),
      });
      setConnecting(null);
      setAccountRef("");
      setSecretKey("");
      setPublishableKey("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(null);
    }
  }

  async function disconnect(provider: string) {
    setError("");
    setIsDeleting(provider);
    try {
      await delay(1200); // 1.2s authentic disconnecting delay
      await api.del(`/v1/gateways/${provider}`);
      setConfirmDisconnect(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsDeleting(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Payment Gateways</h2>
          <p>Connect your own gateway — charges land in your account</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="gateway-grid">
        {CATALOG.map((g) => {
          const acct = connected(g.provider);
          return (
            <div key={g.provider} className="gateway-card">
              <div className="gateway-top">
                <div className="gateway-logo">{g.name[0]}</div>
                <div>
                  <div className="gateway-name">{g.name}</div>
                  <div className="gateway-blurb">{g.blurb}</div>
                </div>
              </div>

              {acct ? (
                <div className="gateway-status">
                  <span className="badge active">Connected</span>
                  <div className="mono" style={{ marginTop: 8 }}>
                    {acct.account_ref || "—"}
                  </div>
                  <div className="mono">since {formatDate(acct.created_at)}</div>
                  {confirmDisconnect === g.provider ? (
                    <div className="disconnect-confirm">
                      <span>Disconnect {g.name}? Charges through it will stop.</span>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => disconnect(g.provider)}
                          disabled={isSaving !== null || isDeleting !== null}
                        >
                          {isDeleting === g.provider ? (
                            <span className="spinner-inline">Disconnecting...</span>
                          ) : (
                            "Yes, disconnect"
                          )}
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => setConfirmDisconnect(null)}
                          disabled={isSaving !== null || isDeleting !== null}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="row" style={{ marginTop: 10 }}>
                      <button
                        className="btn-ghost"
                        onClick={() => openForm(g.provider)}
                        disabled={isSaving !== null || isDeleting !== null}
                      >
                        Update keys
                      </button>
                      <button
                        className="btn-ghost btn-ghost-danger"
                        onClick={() => {
                          setConnecting(null);
                          setConfirmDisconnect(g.provider);
                        }}
                        disabled={isSaving !== null || isDeleting !== null}
                      >
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  className="btn btn-sm"
                  onClick={() => openForm(g.provider)}
                  disabled={isSaving !== null || isDeleting !== null}
                >
                  Connect {g.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {connecting && (() => {
        const g = CATALOG.find((x) => x.provider === connecting);
        if (!g) return null;
        const acct = connected(connecting);
        return (
          <Modal
            title={`${acct ? "Update" : "Connect"} ${g.name}`}
            onClose={() => {
              if (isSaving === null) setConnecting(null);
            }}
          >
            <div className="gateway-form">
              <label>{g.refLabel}</label>
              <input
                value={accountRef}
                onChange={(e) => setAccountRef(e.target.value)}
                placeholder={g.refLabel}
                disabled={isSaving !== null}
              />
              <label>{g.secretLabel}</label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={g.secretLabel}
                disabled={isSaving !== null}
              />
              {"pubLabel" in g && g.pubLabel && (
                <>
                  <label>{g.pubLabel}</label>
                  <input
                    value={publishableKey}
                    onChange={(e) => setPublishableKey(e.target.value)}
                    placeholder={g.pubLabel}
                    disabled={isSaving !== null}
                  />
                  <div className="gateway-hint" style={{ marginTop: 10 }}>
                    Test keys only — real cards vault &amp; dunning runs through Stripe test mode.
                  </div>
                </>
              )}
              <div className="row" style={{ marginTop: 20 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => connect(g.provider)}
                  disabled={isSaving !== null}
                >
                  {isSaving === g.provider ? (
                    <span className="spinner-inline">Connecting...</span>
                  ) : acct ? (
                    "Save keys"
                  ) : (
                    "Save & connect"
                  )}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setConnecting(null)}
                  disabled={isSaving !== null}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      <div className="panel" style={{ marginTop: 24 }}>
        <h3>How it works</h3>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Connecting a gateway links <strong>your own</strong> Stripe (or other) account
          to the platform via Stripe Connect. We then charge your customers <em>as you</em>,
          and the money settles directly into your balance. Cards are vaulted by the
          gateway (PCI stays with them) — we only store reference tokens.
        </p>
      </div>
    </div>
  );
}
