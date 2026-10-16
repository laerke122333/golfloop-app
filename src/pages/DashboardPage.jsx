import React from "react";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flag,
  Plus,
  Repeat2,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

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

export default function DashboardPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [repeatingSessionId, setRepeatingSessionId] = useState(null);


  async function repeatTraining(session) {
    setError("");
    setRepeatingSessionId(session.id);

    try {
      // 1. Hent alle øvelser fra den gamle træning
      const { data: originalExercises, error: exercisesError } = await supabase
        .from("training_session_exercises")
        .select(
          "exercise_id,exercise_title,category,description,instructions,duration_minutes,position",
        )
        .eq("session_id", session.id)
        .order("position", { ascending: true });

      if (exercisesError) {
        throw exercisesError;
      }

      if (!originalExercises?.length) {
        throw new Error("Denne træning indeholder ingen øvelser.");
      }

      // 2. Opret en NY træning
      const { data: newSession, error: sessionError } = await supabase
        .from("training_sessions")
        .insert({
          user_id: user.id,
          title: session.title || "Min træning",
          duration_minutes: session.duration_minutes,
          focus_areas: session.focus_areas || [],
          facility: session.facility || "Flere faciliteter",
          prioritize_recent_round: Boolean(session.prioritize_recent_round),
          status: "planned",
        })
        .select()
        .single();

      if (sessionError) {
        throw sessionError;
      }

      // 3. Kopiér øvelserne til den nye træning
      const newExercises = originalExercises.map((exercise, index) => ({
        session_id: newSession.id,
        exercise_id: exercise.exercise_id,
        exercise_title: exercise.exercise_title,
        category: exercise.category,
        description: exercise.description,
        instructions: exercise.instructions || [],
        duration_minutes: Number(exercise.duration_minutes),
        position: index,

        // Ny træning starter fra 0
        completed: false,
        result_notes: null,
        actual_duration_seconds: 0,
      }));

      // 4. Gem de nye øvelser
      const { error: insertError } = await supabase
        .from("training_session_exercises")
        .insert(newExercises);

      if (insertError) {
        // Hvis øvelserne ikke kan gemmes,
        // så fjern den nye træning igen
        await supabase
          .from("training_sessions")
          .delete()
          .eq("id", newSession.id)
          .eq("user_id", user.id);

        throw insertError;
      }

      // 5. Åbn den nye kopi
      navigate(`/sessions/${newSession.id}`);
    } catch (repeatError) {
      console.error("Fejl ved gentagelse af træning:", repeatError);

      setError(`Træningen kunne ikke gentages: ${repeatError.message}`);
    } finally {
      setRepeatingSessionId(null);
    }
  }
  
  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      const [sessionResult, countResult, reviewResult] = await Promise.all([
        supabase
          .from("training_sessions")
          .select(
            "id,title,duration_minutes,status,created_at,focus_areas,facility,prioritize_recent_round",
          )
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("training_sessions")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("round_reviews")
          .select("id,played_at,focus_areas,notes,created_at")
          .order("played_at", { ascending: false })
          .limit(3),
      ]);
      if (!active) return;
      if (sessionResult.error || countResult.error || reviewResult.error) {
        setError(
          (sessionResult.error || countResult.error || reviewResult.error)
            ?.message || "Kunne ikke hente dine data.",
        );
      }
      setSessions(sessionResult.data || []);
      setSessionCount(countResult.count || 0);
      setReviews(reviewResult.data || []);
      setLoading(false);
    }
    if (user) loadDashboard();
    return () => {
      active = false;
    };
  }, [user]);

  async function deleteSession(sessionId) {
    const sessionToDelete = sessions.find(
      (session) => session.id === sessionId,
    );

    if (!sessionToDelete) return;

    const confirmed = window.confirm(
      `Vil du slette "${sessionToDelete.title || "denne træning"}"?\n\nTræningen og dens øvelser, tider og noter bliver slettet permanent.`,
    );

    if (!confirmed) return;

    setError("");

    async function repeatTraining(session) {
      setError("");
      setRepeatingSessionId(session.id);

      try {
        // Hent øvelserne fra den gamle træning
        const { data: originalExercises, error: exercisesError } =
          await supabase
            .from("training_session_exercises")
            .select(
              "exercise_id,exercise_title,category,description,instructions,duration_minutes,position",
            )
            .eq("session_id", session.id)
            .order("position", { ascending: true });

        if (exercisesError) throw exercisesError;

        if (!originalExercises?.length) {
          throw new Error("Træningen indeholder ingen øvelser.");
        }

        // Opret en NY træning
        const { data: newSession, error: sessionError } = await supabase
          .from("training_sessions")
          .insert({
            user_id: user.id,
            title: session.title || "Min træning",
            duration_minutes: session.duration_minutes,
            focus_areas: session.focus_areas || [],
            facility: session.facility || "Flere faciliteter",
            prioritize_recent_round: Boolean(session.prioritize_recent_round),
            status: "planned",
          })
          .select()
          .single();

        if (sessionError || !newSession) {
          throw (
            sessionError || new Error("Den nye træning kunne ikke oprettes.")
          );
        }

        // Kopiér øvelserne – men nulstil resultat/tid
        const newExercises = originalExercises.map((exercise, index) => ({
          session_id: newSession.id,
          exercise_id: exercise.exercise_id,
          exercise_title: exercise.exercise_title,
          category: exercise.category,
          description: exercise.description,
          instructions: exercise.instructions || [],
          duration_minutes: Number(exercise.duration_minutes),
          position: index,
          completed: false,
          result_notes: null,
          actual_duration_seconds: 0,
        }));

        const { error: insertExercisesError } = await supabase
          .from("training_session_exercises")
          .insert(newExercises);

        if (insertExercisesError) {
          await supabase
            .from("training_sessions")
            .delete()
            .eq("id", newSession.id)
            .eq("user_id", user.id);

          throw insertExercisesError;
        }

        // Åbn den nye kopi
        navigate(`/sessions/${newSession.id}`);
      } catch (repeatError) {
        console.error("GolfLoop repeat-fejl:", repeatError);

        setError(`Træningen kunne ikke gentages: ${repeatError.message}`);
      } finally {
        setRepeatingSessionId(null);
      }
    }

    const { error: deleteError } = await supabase
      .from("training_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (deleteError) {
      setError(`Træningen kunne ikke slettes: ${deleteError.message}`);
      return;
    }

    setSessions((current) =>
      current.filter((session) => session.id !== sessionId),
    );

    setSessionCount((current) => Math.max(0, current - 1));
  }

  const firstName =
    user?.email?.split("@")[0]?.split(/[._-]/)[0] || "golfspiller";
  const latestReview = reviews[0];
  const plannedCount = sessions.filter(
    (session) =>
      session.status === "planned" || session.status === "in_progress",
  ).length;

  return (
    <div className="dashboard-page page-enter">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">DIT GOLFOVERBLIK</div>
          <h1>
            Hej, {firstName}
            <span className="heading-dot">.</span>
          </h1>
          <p className="page-lead">
            Små, målrettede træninger kan gøre en stor forskel. Hvad vil du
            arbejde med i dag?
          </p>
        </div>
        <Link to="/planner" className="button button-primary welcome-action">
          <Plus size={18} /> Planlæg træning
        </Link>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <span className="muted">
            {" "}
            Kontrollér, at du har kørt SQL-scriptet i Supabase.
          </span>
        </div>
      )}

      <section className="hero-card">
        <div className="hero-text">
          <span className="hero-pill">DIN NÆSTE FORBEDRING STARTER HER</span>
          <h2>
            Spil. Lær.
            <br />
            <em>Træn bedre.</em>
          </h2>
          <p>
            Brug erfaringerne fra din seneste runde til at sammensætte en
            træning, der passer til dig og den tid, du har.
          </p>
          <Link to="/round-review" className="hero-cta">
            Evaluér min seneste runde <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-circle hero-circle-one" />
          <div className="hero-circle hero-circle-two" />
          <div className="hero-course-line hero-line-one" />
          <div className="hero-course-line hero-line-two" />
          <div className="hero-distance">DIT NÆSTE SLAG</div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Dine tal">
        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <CalendarDays size={20} />
          </div>
          <div className="stat-label">Træningsplaner</div>
          <div className="stat-value">{loading ? "—" : sessionCount}</div>
          <div className="stat-foot">Oprettet i alt</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-sand">
            <Clock3 size={20} />
          </div>
          <div className="stat-label">Planlagt lige nu</div>
          <div className="stat-value">{loading ? "—" : plannedCount}</div>
          <div className="stat-foot">Venter på dig</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Seneste evalueringer</div>
          <div className="stat-value">{loading ? "—" : reviews.length}</div>
          <div className="stat-foot">Maks. 3 seneste vises</div>
        </div>
      </section>

      <div className="dashboard-columns">
        <section className="panel-section">
          <div className="section-heading-row">
            <div>
              <div className="eyebrow">FORTSÆT HERFRA</div>
              <h2>Dine træninger</h2>
            </div>
            <Link to="/planner" className="text-link">
              Ny plan <ArrowRight size={15} />
            </Link>
          </div>
          {loading ? (
            <div className="empty-state compact">
              <span className="spinner" /> Henter træninger…
            </div>
          ) : sessions.length ? (
            <div className="session-list">
              {sessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <Link
                    to={`/sessions/${session.id}`}
                    className="session-row-link"
                  >
                    <div
                      className={`session-row-icon ${
                        session.status === "completed" ? "is-complete" : ""
                      }`}
                    >
                      {session.status === "completed" ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Target size={20} />
                      )}
                    </div>

                    <div className="session-row-main">
                      <strong>{session.title || "Min træning"}</strong>

                      <span>
                        {(session.focus_areas || []).join(" · ") ||
                          "Personlig træning"}
                      </span>

                      <span
                        className={`session-status-badge session-status-${session.status}`}
                      >
                        {session.status === "completed"
                          ? "Gennemført"
                          : session.status === "in_progress"
                            ? "I gang"
                            : "Gemt"}
                      </span>
                    </div>

                    <div className="session-row-meta">
                      <span>{session.duration_minutes} min.</span>
                      <small>
                        {formatDate(
                          session.status === "completed"
                            ? session.completed_at
                            : session.created_at,
                        )}
                      </small>
                    </div>

                    <ArrowRight className="session-arrow" size={17} />
                  </Link>

                  {session.status === "completed" && (
                    <button
                      type="button"
                      className="session-repeat-button"
                      onClick={() => repeatTraining(session)}
                      disabled={repeatingSessionId === session.id}
                    >
                      <Repeat2 size={15} />

                      {repeatingSessionId === session.id
                        ? "Opretter…"
                        : "Gennemfør igen"}
                    </button>
                  )}

                  {/* Din slet-knap kommer her */}

                  <button
                    type="button"
                    className="session-delete-button"
                    onClick={() => deleteSession(session.id)}
                    aria-label={`Slet ${session.title || "træning"}`}
                    title="Slet træning"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <CalendarDays size={23} />
              </div>
              <h3>Din første træning venter</h3>
              <p>
                Vælg hvor lang tid du har, og sammensæt en træning med dine egne
                fokusområder.
              </p>
              <Link to="/planner" className="button button-outline">
                Planlæg min første træning <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>

        <section className="panel-section recent-focus-panel">
          <div className="section-heading-row">
            <div>
              <div className="eyebrow">LÆR AF DIT SPIL</div>
              <h2>Efter runden</h2>
            </div>
          </div>
          {loading ? (
            <div className="empty-state compact">Henter…</div>
          ) : latestReview ? (
            <div className="latest-review-card">
              <div className="review-date">
                Seneste evaluering · {formatDate(latestReview.played_at)}
              </div>
              <h3>Dit næste fokus</h3>
              <div className="tag-list">
                {(latestReview.focus_areas || []).map((area) => (
                  <span
                    className={`tag tag-${categoryColors[area] || "green"}`}
                    key={area}
                  >
                    {area}
                  </span>
                ))}
              </div>
              {latestReview.notes && (
                <p className="review-note">“{latestReview.notes}”</p>
              )}
              <Link
                to="/planner"
                className="button button-primary panel-full-button"
              >
                Planlæg med mit fokus <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="empty-state empty-state-small">
              <div className="empty-state-icon">
                <TrendingUp size={22} />
              </div>
              <h3>Find dit næste fokus</h3>
              <p>Notér, hvad du gerne vil øve efter din næste runde.</p>
              <Link to="/round-review" className="button button-outline">
                Evaluér en runde
              </Link>
            </div>
          )}
        </section>
      </div>

      <section className="bottom-prompt">
        <div className="bottom-prompt-icon">
          <BookOpenIcon />
        </div>
        <div>
          <strong>Brug for inspiration til øvelser?</strong>
          <p>
            Find konkrete øvelser til jernslag, wedges, putting og meget mere.
          </p>
        </div>
        <Link to="/exercises" className="text-link">
          Se øvelser <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}

function SparkleIcon() {
  return <span className="tiny-sparkle">✳</span>;
}
function BookOpenIcon() {
  return <Target size={20} />;
}
