import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Flag,
  Play,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./DashboardPage.css";

const categoryColors = {
  Jernslag: "green",
  Wedges: "sand",
  Putting: "blue",
  Driver: "olive",
  Bunker: "purple",
};

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function getStatusLabel(status) {
  if (status === "completed") {
    return "Gennemført";
  }

  if (status === "in_progress") {
    return "I gang";
  }

  return "Planlagt";
}

function getStatusClass(status) {
  if (status === "completed") {
    return "dashboard-status-completed";
  }

  if (status === "in_progress") {
    return "dashboard-status-progress";
  }

  return "dashboard-status-planned";
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const [sessionResult, countResult, reviewResult] = await Promise.all([
        supabase
          .from("training_sessions")
          .select("id,title,duration_minutes,status,created_at,focus_areas")
          .order("created_at", {
            ascending: false,
          })
          .limit(4),

        supabase.from("training_sessions").select("id", {
          count: "exact",
          head: true,
        }),

        supabase
          .from("round_reviews")
          .select("id,played_at,focus_areas,notes,created_at")
          .order("played_at", {
            ascending: false,
          })
          .limit(3),
      ]);

      if (!active) return;

      const firstError =
        sessionResult.error || countResult.error || reviewResult.error;

      if (firstError) {
        setError(firstError.message || "Kunne ikke hente dine data.");
      }

      setSessions(sessionResult.data || []);

      setSessionCount(countResult.count || 0);

      setReviews(reviewResult.data || []);

      setLoading(false);
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const latestReview = reviews[0];

  const plannedSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.status === "planned" || session.status === "in_progress",
      ),
    [sessions],
  );

  const firstName =
    user?.email?.split("@")[0]?.split(/[._-]/)[0] || "golfspiller";

  return (
    <div className="dashboard-page page-enter">
      {/* =====================================================
          HERO / VALG AF TRÆNING
      ====================================================== */}

      <section className="dashboard-hero">
        <div className="dashboard-hero-overlay" />

        <div className="dashboard-hero-content">
          <div className="dashboard-hero-heading">
            <span className="dashboard-eyebrow">DIT GOLFOVERBLIK</span>

            <h1>
              Hvad vil du
              <br />
              træne i dag?
              <span className="heading-dot">.</span>
            </h1>

            <p>Vælg den træning, der passer til dit mål.</p>
          </div>

          {/* TRÆNINGSTYPER */}

          <div className="dashboard-training-grid">
            <Link
              to="/planner"
              className="dashboard-training-card dashboard-training-golf"
            >
              <div className="dashboard-training-icon">
                <Flag size={21} />
              </div>

              <div className="dashboard-training-content">
                <h2>Golftræning</h2>
                <p>Forbedr dit golfspil med klare og effektive øvelser.</p>
              </div>

              <span className="dashboard-training-arrow" aria-hidden="true">
                <ArrowRight size={17} />
              </span>
            </Link>

            <Link
              to="/golf-fitness"
              className="dashboard-training-card dashboard-training-fitness"
            >
              <div className="dashboard-training-icon">
                <Dumbbell size={21} />
              </div>

              <div className="dashboard-training-content">
                <h2>Styrketræning</h2>
                <p>Bliv stærkere, mere stabil og bedre rustet til golf.</p>
              </div>

              <span className="dashboard-training-arrow" aria-hidden="true">
                <ArrowRight size={17} />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================
          ERROR
      ====================================================== */}

      {error && <div className="dashboard-alert">{error}</div>}

      {/* =====================================================
          DINE TRÆNINGER
      ====================================================== */}

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">FORTSÆT HERFRA</span>

            <h2>Dine træninger</h2>
          </div>

          <Link to="/history" className="dashboard-section-link">
            Se alle
            <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="dashboard-loading">
            <span className="dashboard-spinner" />
            Henter dine træninger…
          </div>
        ) : sessions.length ? (
          <div className="dashboard-session-list">
            {sessions.slice(0, 3).map((session) => (
              <Link
                key={session.id}
                to={`/sessions/${session.id}`}
                className="dashboard-session"
              >
                <div
                  className={`dashboard-session-icon ${
                    session.status === "completed"
                      ? "dashboard-session-icon-complete"
                      : ""
                  }`}
                >
                  {session.status === "completed" ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    <Target size={21} />
                  )}
                </div>

                <div className="dashboard-session-main">
                  <strong>{session.title || "Min træning"}</strong>

                  <div className="dashboard-session-info">
                    <span>
                      {(session.focus_areas || []).slice(0, 3).join(" · ") ||
                        "Personlig træning"}
                    </span>

                    <span
                      className={`dashboard-status ${getStatusClass(
                        session.status,
                      )}`}
                    >
                      {getStatusLabel(session.status)}
                    </span>
                  </div>
                </div>

                <div className="dashboard-session-meta">
                  <strong>
                    {session.duration_minutes} <small>min.</small>
                  </strong>

                  <span>{formatDate(session.created_at)}</span>
                </div>

                <ArrowRight className="dashboard-session-arrow" size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <div className="dashboard-empty-icon">
              <Play size={23} />
            </div>

            <h3>Din første træning venter</h3>

            <p>Vælg golftræning ovenfor, og kom i gang med din første plan.</p>

            <Link to="/planner" className="dashboard-outline-button">
              Planlæg golftræning
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>

      
      {/* =====================================================
          FOKUS
      ====================================================== */}

      <section className="dashboard-focus-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">LÆR AF DIT SPIL</span>

            <h2>Dit næste fokus</h2>
          </div>

          
        </div>

        {loading ? (
          <div className="dashboard-focus-card">
            <div className="dashboard-loading">
              <span className="dashboard-spinner" />
              Henter dit fokus…
            </div>
          </div>
        ) : latestReview ? (
          <div className="dashboard-focus-card">
            <div className="dashboard-focus-top">
              <div>
                <span className="dashboard-focus-date">
                  SENESTE RUNDE · {formatDate(latestReview.played_at)}
                </span>

                <h3>Arbejd videre med</h3>
              </div>

              <Sparkles size={22} className="dashboard-focus-sparkle" />
            </div>

            <div className="dashboard-focus-tags">
              {(latestReview.focus_areas || []).map((area) => (
                <span
                  key={area}
                  className={`dashboard-focus-tag dashboard-focus-tag-${
                    categoryColors[area] || "green"
                  }`}
                >
                  {area}
                </span>
              ))}
            </div>

            {latestReview.notes && (
              <p className="dashboard-focus-note">“{latestReview.notes}”</p>
            )}

            <p className="dashboard-focus-description">
              GolfLoop bruger din seneste evaluering til at hjælpe dig med at
              vælge, hvad du bør træne næste gang.
            </p>

            <Link to="/round-review" className="dashboard-focus-button">
              Planlæg med mit fokus
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div className="dashboard-focus-card dashboard-focus-empty">
            <div className="dashboard-focus-empty-icon">
              <TrendingUp size={25} />
            </div>

            <div>
              <h3>Find dit næste fokus</h3>

              <p>
                Evaluér din seneste runde og fortæl GolfLoop, hvad du gerne vil
                forbedre.
              </p>

              <Link to="/round-review" className="dashboard-outline-button">
                Evaluér min runde
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        )}
      </section>

      
    </div>
  );
}
