import React, { createContext, useContext, useState, useEffect } from "react";
import { auth } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    auth
      .getMe()
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await auth.login(email, password);
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (email, password, name) => {
    await auth.register(email, password, name);
    return login(email, password);
  };

  // One call for both sign-up and sign-in: from the user's side there is no
  // difference, and the server decides whether this Google account is new,
  // already known, or belongs to an existing password account.
  const loginWithGoogle = async (credential) => {
    const res = await auth.google(credential);
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  // Re-read the user after preferences change, so onboarding state and
  // project defaults update without a page reload.
  const refreshUser = async () => {
    const res = await auth.getMe();
    setUser(res.data);
    return res.data;
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, register, loginWithGoogle, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
