import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const links = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/projects/new", label: "New Project" },
    { path: "/settings", label: "Settings" },
  ];

  return (
    <div className="w-60 bg-surface border-r border-border h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6">
        <span className="text-gold text-xl font-bold">BAAKHAPAA</span>
      </div>
      <nav className="flex-1 px-3">
        {links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`block px-3 py-2 rounded-lg mb-1 text-sm ${
              location.pathname === link.path ? "bg-elevated text-gold" : "text-gray-400 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="text-sm text-white">{user?.name}</div>
        <button onClick={logout} className="text-xs text-gray-500 hover:text-gold mt-1">
          Sign out
        </button>
      </div>
    </div>
  );
}
