import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import CommandPalette from "./components/CommandPalette";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import NewProject from "./pages/NewProject";
import ScriptEditor from "./pages/ScriptEditor";
import StoryboardView from "./pages/StoryboardView";
import PricingPage from "./pages/PricingPage";
import SettingsPage from "./pages/SettingsPage";
import StoryboardsPage from "./pages/StoryboardsPage";
import ExportsPage from "./pages/ExportsPage";
import LearnPage from "./pages/LearnPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/storyboards" element={<ProtectedRoute><StoryboardsPage /></ProtectedRoute>} />
          <Route path="/exports" element={<ProtectedRoute><ExportsPage /></ProtectedRoute>} />
          <Route path="/learn" element={<ProtectedRoute><LearnPage /></ProtectedRoute>} />
          <Route path="/projects/:id/editor" element={<ProtectedRoute><ScriptEditor /></ProtectedRoute>} />
          <Route path="/projects/:id/storyboard" element={<ProtectedRoute><StoryboardView /></ProtectedRoute>} />
        </Routes>
        <CommandPalette />
      </BrowserRouter>
    </AuthProvider>
  );
}
