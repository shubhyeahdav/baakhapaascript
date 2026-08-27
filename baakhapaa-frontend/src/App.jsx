import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./i18n";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import CommandPalette from "./components/CommandPalette";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import NewProject from "./pages/NewProject";
import ScriptEditor from "./pages/ScriptEditor";
import ProjectSetup from "./pages/ProjectSetup";
import StoryboardView from "./pages/StoryboardView";
import PricingPage from "./pages/PricingPage";
import PaymentReturn from "./pages/PaymentReturn";
import SettingsPage from "./pages/SettingsPage";
import StoryboardsPage from "./pages/StoryboardsPage";
import ExportsPage from "./pages/ExportsPage";
import LearnPage from "./pages/LearnPage";
import LegalPage from "./pages/LegalPage";

export default function App() {
  return (
    // Outermost, so a throw inside AuthProvider or the router is caught too.
    // Without this a render error unmounts the tree to a white page, taking
    // the writer's unsaved draft with it.
    <ErrorBoundary>
      <LanguageProvider>
      <AuthProvider>
        {/* No `future` prop: those were the v6 opt-ins for v7 behaviour, and on
            react-router-dom 7 they are simply the defaults. Kept here as a note
            because the flags being present in v6 is what made this upgrade a
            non-event — the app was already running v7 semantics. */}
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            {/* Public, and they have to be: somebody deciding whether to sign
                up needs to read what they are agreeing to BEFORE they have an
                account. Both were unreachable from the app until now. */}
            <Route path="/terms" element={<LegalPage doc="terms" />} />
            <Route path="/privacy" element={<LegalPage doc="privacy" />} />
            {/* Every gateway redirects here. The provider is in the PATH, not a
                query parameter: each gateway appends its own query string to the
                URL we hand it, and eSewa's docs do not say what it does when one
                is already there. Protected, because verifying a payment has to
                happen as the account that opened it. */}
            <Route path="/payment/return/:provider" element={<ProtectedRoute><PaymentReturn /></ProtectedRoute>} />
            {/* The older query-parameter form, kept so a payment already in
                flight at deploy time still lands somewhere that works. */}
            <Route path="/payment/return" element={<ProtectedRoute><PaymentReturn /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/projects/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/storyboards" element={<ProtectedRoute><StoryboardsPage /></ProtectedRoute>} />
            <Route path="/exports" element={<ProtectedRoute><ExportsPage /></ProtectedRoute>} />
            <Route path="/learn" element={<ProtectedRoute><LearnPage /></ProtectedRoute>} />
            <Route path="/projects/:id/setup" element={<ProtectedRoute><ProjectSetup /></ProtectedRoute>} />
            <Route path="/projects/:id/editor" element={<ProtectedRoute><ScriptEditor /></ProtectedRoute>} />
            <Route path="/projects/:id/storyboard" element={<ProtectedRoute><StoryboardView /></ProtectedRoute>} />
          </Routes>
          <CommandPalette />
        </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
