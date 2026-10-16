import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ArrowRight, Database, Flag, KeyRound } from "lucide-react";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PlannerPage from "./pages/PlannerPage";
import ExercisesPage from "./pages/ExercisesPage";
import RoundReviewPage from "./pages/RoundReviewPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import HistoryPage from "./pages/HistoryPage";
import { isSupabaseConfigured } from "./lib/supabaseClient";

function SetupRequired() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="setup-brand">
          <span className="brand-mark">
            <Flag size={22} />
          </span>
          <strong>
            GolfLoop<span>.</span>
          </strong>
        </div>
        <div className="eyebrow">ÉN HURTIG OPSÆTNING</div>
        <h1>Forbind din Supabase</h1>
        <p>
          Appen er klar, men mangler URL og publishable key fra dit
          Supabase-projekt. Følg disse trin, så kommer du videre.
        </p>
        <ol className="setup-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Opret et Supabase-projekt</strong>
              <p>Åbn Supabase, og opret et nyt projekt til GolfLoop.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Opret .env.local</strong>
              <p>Kopiér .env.example til .env.local i projektets rodmappe.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Indsæt dine værdier</strong>
              <p>
                Indsæt Project URL og publishable key fra Supabase under de to
                VITE_ variabler.
              </p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>Genstart React</strong>
              <p>
                Stop udviklingsserveren med Ctrl+C, og kør{" "}
                <code>npm run dev</code> igen.
              </p>
            </div>
          </li>
        </ol>
        <div className="setup-info">
          <KeyRound size={18} />
          <span>
            Brug kun Supabase' publishable key i frontend. Del aldrig din
            service_role key i React-kode.
          </span>
        </div>
        <a
          className="button button-primary"
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noreferrer"
        >
          Åbn Supabase <ArrowRight size={17} />
        </a>
        <div className="setup-note">
          <Database size={16} /> Husk også at køre{" "}
          <code>supabase/schema.sql</code> i Supabase SQL Editor, når
          forbindelsen er sat op.
        </div>
      </div>
    </main>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/round-review" element={<RoundReviewPage />} />
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
