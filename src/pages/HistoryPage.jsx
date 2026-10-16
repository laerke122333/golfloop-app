import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Target,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

function formatLongTime(totalSeconds = 0) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    if (minutes === 0) {
      return `${hours} t.`;
    }

    return `${hours} t. ${minutes} min.`;
  }

  if (minutes > 0) {
    if (remainingSeconds === 0) {
      return `${minutes} min.`;
    }

    return `${minutes} min. ${remainingSeconds} sek.`;
  }

  return `${remainingSeconds} sek.`;
}

function formatDate(value) {
  if (!value) return "Dato ikke angivet";

  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function HistoryPage() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSessionId, setOpenSessionId] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      if (!user?.id) {
        setError("Du er ikke logget ind. Log ind igen og prøv på ny.");
        setLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("training_sessions")
        .select(
          `
            id,
            title,
            duration_minutes,
            focus_areas,
            status,
            created_at,
            completed_at,
            training_session_exercises (
              id,
              exercise_title,
              category,
              duration_minutes,
              position,
              completed,
              result_notes,
              actual_duration_seconds
            )
          `,
        )
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (!active) return;

      if (queryError) {
        console.error("GolfLoop historikfejl:", queryError);
        setError(
          `Dine tidligere træninger kunne ikke hentes: ${queryError.message}`,
        );
        setSessions([]);
        setLoading(false);
        return;
      }

      const preparedSessions = (data || []).map((session) => {
        const exercises = [...(session.training_session_exercises || [])].sort(
          (a, b) => a.position - b.position,
        );

        const totalActualSeconds = exercises.reduce(
          (sum, exercise) =>
            sum + Number(exercise.actual_duration_seconds || 0),
          0,
        );

        const completedExercises = exercises.filter(
          (exercise) => exercise.completed,
        ).length;

        return {
          ...session,
          exercises,
          totalActualSeconds,
          completedExercises,
        };
      });

      setSessions(preparedSessions);
      setLoading(false);
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const totalTrainingSeconds = useMemo(() => {
    return sessions.reduce(
      (sum, session) => sum + session.totalActualSeconds,
      0,
    );
  }, [sessions]);

  const totalExercises = useMemo(() => {
    return sessions.reduce(
      (sum, session) => sum + session.completedExercises,
      0,
    );
  }, [sessions]);

  function toggleSession(sessionId) {
    setOpenSessionId((current) => (current === sessionId ? null : sessionId));
  }

  if (loading) {
    return (
      <div className="empty-state page-loader">
        <span className="spinner" />
        Henter dine tidligere træninger…
      </div>
    );
  }

  return (
    <div className="page-enter history-page">
      <div className="page-header history-page-header">
        <div>
          <div className="eyebrow">DIN UDVIKLING</div>

          <h1>
            Tidligere træninger
            <span className="heading-dot">.</span>
          </h1>

          <p className="page-lead">
            Se dine tidligere træninger, din faktiske træningstid og de noter,
            du har skrevet undervejs.
          </p>
        </div>

        <div className="page-header-icon">
          <Clock3 size={24} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* SAMLET OVERBLIK */}
      {sessions.length > 0 && (
        <section className="history-overview">
          <div className="history-stat-card history-stat-main">
            <div className="history-stat-icon">
              <Clock3 size={21} />
            </div>

            <div>
              <span>Samlet træningstid</span>
              <strong>{formatLongTime(totalTrainingSeconds)}</strong>
            </div>
          </div>

          <div className="history-stat-card">
            <div className="history-stat-icon">
              <Trophy size={21} />
            </div>

            <div>
              <span>Træninger</span>
              <strong>{sessions.length}</strong>
            </div>
          </div>

          <div className="history-stat-card">
            <div className="history-stat-icon">
              <CheckCircle2 size={21} />
            </div>

            <div>
              <span>Øvelser gennemført</span>
              <strong>{totalExercises}</strong>
            </div>
          </div>
        </section>
      )}

      {/* INGEN TRÆNINGER */}
      {sessions.length === 0 && !error && (
        <div className="history-empty">
          <div className="history-empty-icon">
            <Clock3 size={30} />
          </div>

          <h2>Ingen tidligere træninger endnu</h2>

          <p>
            Når du har gennemført din første træning, kan du finde den her
            sammen med dine tider og noter.
          </p>

          <Link to="/planner" className="button button-primary">
            Planlæg min første træning
            <ArrowRight size={17} />
          </Link>
        </div>
      )}

      {/* TRÆNINGER */}
      {sessions.length > 0 && (
        <section className="history-list">
          <div className="history-section-heading">
            <div>
              <span className="eyebrow">TRÆNINGSLOG</span>
              <h2>Dine gennemførte træninger</h2>
            </div>

            <span className="history-count">
              {sessions.length}{" "}
              {sessions.length === 1 ? "træning" : "træninger"}
            </span>
          </div>

          {sessions.map((session) => {
            const isOpen = openSessionId === session.id;

            return (
              <article
                className={`history-session-card ${
                  isOpen ? "history-session-card-open" : ""
                }`}
                key={session.id}
              >
                <button
                  type="button"
                  className="history-session-header"
                  onClick={() => toggleSession(session.id)}
                  aria-expanded={isOpen}
                >
                  <div className="history-session-date">
                    <div className="history-calendar-icon">
                      <CalendarDays size={19} />
                    </div>

                    <div>
                      <span>
                        {formatShortDate(
                          session.completed_at || session.created_at,
                        )}
                      </span>

                      <strong>{session.title || "Min træning"}</strong>
                    </div>
                  </div>

                  <div className="history-session-summary">
                    <div className="history-session-time">
                      <Clock3 size={16} />

                      <strong>
                        {formatLongTime(session.totalActualSeconds)}
                      </strong>
                    </div>

                    <span className="history-session-progress">
                      {session.completedExercises} af {session.exercises.length}{" "}
                      øvelser
                    </span>

                    <ChevronDown
                      size={20}
                      className={isOpen ? "history-chevron-open" : ""}
                    />
                  </div>
                </button>

                {session.focus_areas?.length > 0 && (
                  <div className="history-focus-tags">
                    {session.focus_areas.map((area) => (
                      <span key={area}>{area}</span>
                    ))}
                  </div>
                )}

                {isOpen && (
                  <div className="history-session-details">
                    <div className="history-detail-top">
                      <div>
                        <span className="eyebrow">GENNEMFØRT</span>

                        <h3>
                          {formatDate(
                            session.completed_at || session.created_at,
                          )}
                        </h3>
                      </div>

                      <div className="history-total-time">
                        <span>Faktisk tid</span>
                        <strong>
                          {formatLongTime(session.totalActualSeconds)}
                        </strong>
                      </div>
                    </div>

                    <div className="history-exercise-list">
                      {session.exercises.map((exercise, index) => {
                        const seconds = Number(
                          exercise.actual_duration_seconds || 0,
                        );

                        return (
                          <div
                            className="history-exercise-row"
                            key={exercise.id}
                          >
                            <div className="history-exercise-number">
                              {String(index + 1).padStart(2, "0")}
                            </div>

                            <div className="history-exercise-copy">
                              <span>{exercise.category}</span>

                              <strong>{exercise.exercise_title}</strong>

                              {exercise.result_notes ? (
                                <p>
                                  <span className="history-note-label">
                                    Note
                                  </span>

                                  {exercise.result_notes}
                                </p>
                              ) : (
                                <p className="history-no-note">
                                  Ingen note tilføjet
                                </p>
                              )}
                            </div>

                            <div className="history-exercise-time">
                              <Clock3 size={15} />

                              <strong>{formatLongTime(seconds)}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Link
                      to={`/sessions/${session.id}`}
                      className="history-open-session"
                    >
                      Se træningen igen
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
