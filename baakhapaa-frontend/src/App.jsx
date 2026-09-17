import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./i18n";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import CommandPalette from "./components/CommandPalette";
import RouteChrome from "./components/RouteChrome";

/**
 * Every page is loaded on demand.
 *
 * They were all imported eagerly, which put fifteen pages into one 476 kB
 * chunk: somebody opening /login downloaded the editor, the storyboard viewer
 * and the nineteen-lesson course before they could type an email address. At
 * 146 kB gzipped that is several seconds of blank screen on a 3G connection,
 * which is the connection this product is being built for.
 *
 * Splitting here rather than deeper because the routes are the natural seam —
 * they are already separate files and nothing shares mutable state across them.
 * What stays in the shared chunk is what renders on every route: React, the
 * router, the auth and language providers, the error boundary, the command
 * palette.
 *
 * `LegalPage` is worth its own note. The Terms and Privacy documents are
 * inlined into it through the `virtual:legal-documents` module — 14 kB of
 * markdown that two routes out of fifteen ever read, and which every visitor
 * was downloading.
 *
 * Measured before and after in `docs/perf/`.
 */
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NewProject = lazy(() => import("./pages/NewProject"));
const ScriptEditor = lazy(() => import("./pages/ScriptEditor"));
const ProjectSetup = lazy(() => import("./pages/ProjectSetup"));
const StoryboardView = lazy(() => import("./pages/StoryboardView"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const PaymentReturn = lazy(() => import("./pages/PaymentReturn"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const StoryboardsPage = lazy(() => import("./pages/StoryboardsPage"));
const ExportsPage = lazy(() => import("./pages/ExportsPage"));
const LearnPage = lazy(() => import("./pages/LearnPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

/**
 * What is on screen while a route's chunk arrives.
 *
 * Deliberately not a spinner. On a fast connection this is never seen, and on
 * a slow one a spinner says "something is wrong" where a page-shaped hold says
 * "something is coming" — and the second is true. It carries the app's own
 * background so the transition is not a white flash on a dark theme.
 */
function RouteLoading() {
  return (
    <div
      className="h-screen bg-bg flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="font-display text-[13px] tracking-[0.3em] uppercase text-inkMuted animate-pulse">
        Baakhapaa
      </span>
    </div>
  );
}

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
          {/* Inside the router because it reads the location; before Suspense
              so the skip link and the document title do not wait on a chunk. */}
          <RouteChrome />
          {/* One boundary around the whole route table rather than one per
              route: a page is either the thing you asked for or it is still
              arriving, and fifteen identical fallbacks would say the same
              thing fifteen times. */}
          <Suspense fallback={<RouteLoading />}>
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
            {/* Last, and a real page. Without it an unknown path matched no
                route and rendered nothing at all: HTTP 200, no text, no h1. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <CommandPalette />
        </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
