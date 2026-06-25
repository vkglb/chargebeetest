import { createContext, useContext, useState, type ReactNode } from "react";
import { api, setToken, clearToken, getToken, setGuest, isGuest, type AuthResponse } from "../api/client";
import { resetMock } from "../api/mock";

interface AuthState {
  isAuthenticated: boolean;
  isGuest: boolean;
  merchantId: string | null;
  signup: (
    subdomain: string,
    ownerName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(getToken());
  const [merchantId, setMerchantId] = useState<string | null>(
    localStorage.getItem("chargeebee_merchant"),
  );

  function persist(res: AuthResponse) {
    setToken(res.token);
    localStorage.setItem("chargeebee_merchant", res.merchant_id);
    setTok(res.token);
    setMerchantId(res.merchant_id);
  }

  async function signup(subdomain: string, ownerName: string, email: string, password: string) {
    const res = await api.post<AuthResponse>("/v1/signup", {
      subdomain,
      owner_name: ownerName,
      email,
      password,
    });
    persist(res);
  }

  async function login(email: string, password: string) {
    const res = await api.post<AuthResponse>("/v1/login", { email, password });
    persist(res);
  }

  function loginAsGuest() {
    setGuest();
    localStorage.setItem("chargeebee_merchant", "demo-merchant");
    setTok("guest");
    setMerchantId("demo-merchant");
  }

  function logout() {
    if (isGuest()) resetMock();
    clearToken();
    localStorage.removeItem("chargeebee_merchant");
    setTok(null);
    setMerchantId(null);
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token,
        isGuest: token === "guest",
        merchantId,
        signup,
        login,
        loginAsGuest,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
