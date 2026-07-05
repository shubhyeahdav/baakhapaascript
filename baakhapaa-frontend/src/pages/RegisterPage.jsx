import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    try {
      await register(form.email, form.password, form.name);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="w-96 bg-surface border border-border rounded-2xl p-8">
        <h1 className="text-gold text-3xl font-bold text-center mb-1">BAAKHAPAA</h1>
        <p className="text-gray-500 text-sm text-center mb-6">Create your account</p>
        {error && <div className="text-red-400 text-sm mb-4 text-center">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input placeholder="Name" className="input-dark" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input type="email" placeholder="Email" className="input-dark" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input type="password" placeholder="Password" className="input-dark" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input type="password" placeholder="Confirm Password" className="input-dark" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          <button type="submit" className="btn-gold w-full">Create Account</button>
        </form>
        <p className="text-center text-gray-500 text-sm mt-4">
          Already have an account? <Link to="/login" className="text-gold">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
