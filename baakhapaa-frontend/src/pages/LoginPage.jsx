import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="w-96 bg-surface border border-border rounded-2xl p-8">
        <h1 className="text-gold text-3xl font-bold text-center mb-1">BAAKHAPAA</h1>
        <p className="text-gray-500 text-sm text-center mb-6">AI Powered Pre Production System</p>
        {error && <div className="text-red-400 text-sm mb-4 text-center">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" className="input-dark" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" className="input-dark" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="btn-gold w-full">Sign In</button>
        </form>
        <p className="text-center text-gray-500 text-sm mt-4">
          No account? <Link to="/register" className="text-gold">Register</Link>
        </p>
      </div>
    </div>
  );
}
