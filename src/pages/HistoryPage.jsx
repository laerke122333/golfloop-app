import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  RotateCcw,
  Target,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";
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

function formatRecordedTime(totalSeconds = 0) {
  const seconds = Number(totalSeconds || 0);

  if (seconds <= 0) {
    return "Ikke registreret";
  }

  return formatLongTime(seconds);
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

function formatFitnessPrescription(exercise) {
  const sets = Number(exercise.sets || 0);

  if (exercise.duration_seconds) {
    return `${sets || 1} × ${exercise.duration_seconds} sek.`;
  }

  if (exercise.reps) {
    return `${sets || 1} × ${exercise.reps}`;
  }

  return "";
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSessionKey, setOpenSessionKey] = useState(null);
  const [repeatingSessionKey, setRepeatingSessionKey] = useState(null);

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

      const [
        { data: golfData, error: golfError },
        { data: fitnessData, error: fitnessError },
      ] = await Promise.all([
        supabase
          .from("training_sessions")
          .select(
            `
              id,
title,
duration_minutes,
focus_areas,
facility,
prioritize_recent_round,
status,
created_at,
completed_at,
training_session_exercises (
  id,
  exercise_id,
  exercise_title,
  category,
  description,
  instructions,
  duration_minutes,
  position,
  completed,
  result_notes,
  actual_duration_seconds
)
            `,
          )
          .eq("user_id", user.id)
          .eq("status", "completed"),

        supabase
          .from("fitness_sessions")
          .select(
            `
              id,
              title,
              location,
              goal,
              planned_duration_minutes,
              actual_duration_seconds,
              paused_duration_seconds,
              status,
              created_at,
              completed_at,
              fitness_session_exercises (
                id,
                exercise_title,
                category,
                description,
                instructions,
                sets,
                reps,
                duration_seconds,
                position,
                completed,
                actual_sets,
                actual_reps,
                weight_kg,
                result_notes
              )
            `,
          )
          .eq("user_id", user.id)
          .eq("status", "completed"),
      ]);

      if (!active) return;

      if (golfError || fitnessError) {
        console.error("GolfLoop historikfejl:", {
          golfError,
          fitnessError,
        });

        const errorMessages = [
          golfError && `Golftræning: ${golfError.message}`,
          fitnessError && `Golf Fitness: ${fitnessError.message}`,
        ]
          .filter(Boolean)
          .join(" ");

        setError(
          `Dine tidligere træninger kunne ikke hentes. ${errorMessages}`,
        );
        setSessions([]);
        setLoading(false);
        return;
      }

      const preparedGolfSessions = (golfData || []).map((session) => {
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
          type: "golf",
          typeLabel: "Golftræning",
          exercises,
          totalActualSeconds,
          completedExercises,
          focusAreas: session.focus_areas || [],
          historyKey: `golf-${session.id}`,
          route: `/sessions/${session.id}`,
        };
      });

      const preparedFitnessSessions = (fitnessData || []).map((session) => {
        const exercises = [...(session.fitness_session_exercises || [])].sort(
          (a, b) => a.position - b.position,
        );

        const completedExercises = exercises.filter(
          (exercise) => exercise.completed,
        ).length;

        return {
          ...session,
          type: "fitness",
          typeLabel: "Golf Fitness",
          exercises,
          totalActualSeconds: Number(session.actual_duration_seconds || 0),
          completedExercises,
          focusAreas: session.goal ? [session.goal] : [],
          historyKey: `fitness-${session.id}`,
          route: `/fitness-sessions/${session.id}`,
        };
      });

      const combinedSessions = [
        ...preparedGolfSessions,
        ...preparedFitnessSessions,
      ].sort((a, b) => {
        const dateA = new Date(a.completed_at || a.created_at || 0).getTime();

        const dateB = new Date(b.completed_at || b.created_at || 0).getTime();

        return dateB - dateA;
      });

      setSessions(combinedSessions);
      setLoading(false);
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [user?.id]);

  function toggleSession(sessionKey) {
    setOpenSessionKey((current) =>
      current === sessionKey ? null : sessionKey,
    );
  }

    async function repeatSession(session) {
      if (!user?.id || !session?.exercises?.length) {
        setError("Denne træning kunne ikke gentages.");
        return;
      }

      setRepeatingSessionKey(session.historyKey);
      setError("");

      try {
        if (session.type === "golf") {
          // OPRET NY GOLFTRÆNING
          const { data: newSession, error: sessionError } = await supabase
            .from("training_sessions")
            .insert({
              user_id: user.id,
              title: session.title || "Min træning",
              duration_minutes: session.duration_minutes,
              focus_areas: session.focusAreas || [],
              facility: session.facility || "Flere faciliteter",
              prioritize_recent_round: Boolean(session.prioritize_recent_round),
              status: "planned",
            })
            .select("id")
            .single();

          if (sessionError) {
            throw sessionError;
          }

          const newExercises = session.exercises.map((exercise, index) => ({
            session_id: newSession.id,
            exercise_id: exercise.exercise_id,
            exercise_title: exercise.exercise_title,
            category: exercise.category,
            description: exercise.description || "",
            instructions: exercise.instructions || [],
            duration_minutes: Number(exercise.duration_minutes || 1),
            position: index,
            completed: false,
            result_notes: null,
            actual_duration_seconds: 0,
          }));

          const { error: exercisesError } = await supabase
            .from("training_session_exercises")
            .insert(newExercises);

          if (exercisesError) {
            await supabase
              .from("training_sessions")
              .delete()
              .eq("id", newSession.id)
              .eq("user_id", user.id);

            throw exercisesError;
          }

          navigate(`/sessions/${newSession.id}`);
          return;
        }

        // OPRET NY GOLF FITNESS-TRÆNING
        const { data: newFitnessSession, error: fitnessSessionError } =
          await supabase
            .from("fitness_sessions")
            .insert({
              user_id: user.id,
              title: session.title || "Min golf fitness",
              location: session.location || "Hjemme",
              goal:
                session.goal ||
                session.focusAreas?.[0] ||
                "Generel golfperformance",
              planned_duration_minutes: session.planned_duration_minutes || 30,
              actual_duration_seconds: 0,
              paused_duration_seconds: 0,
              status: "planned",
            })
            .select("id")
            .single();

        if (fitnessSessionError) {
          throw fitnessSessionError;
        }

        const newFitnessExercises = session.exercises.map(
          (exercise, index) => ({
            session_id: newFitnessSession.id,
            exercise_id: exercise.exercise_id,
            exercise_title: exercise.exercise_title,
            category: exercise.category,
            description: exercise.description || "",
            instructions: exercise.instructions || [],
            sets: exercise.sets || 1,
            reps: exercise.reps ?? null,
            duration_seconds: exercise.duration_seconds ?? null,
            rest_seconds: exercise.rest_seconds || 0,
            position: index,
            completed: false,
            actual_sets: null,
            actual_reps: null,
            weight_kg: null,
            result_notes: null,
          }),
        );

        const { error: fitnessExercisesError } = await supabase
          .from("fitness_session_exercises")
          .insert(newFitnessExercises);

        if (fitnessExercisesError) {
          await supabase
            .from("fitness_sessions")
            .delete()
            .eq("id", newFitnessSession.id)
            .eq("user_id", user.id);

          throw fitnessExercisesError;
        }

        navigate(`/fitness-sessions/${newFitnessSession.id}`);
      } catch (repeatError) {
        console.error("Fejl ved gentagelse af træning:", repeatError);

        setError(`Træningen kunne ikke gentages: ${repeatError.message}`);
      } finally {
        setRepeatingSessionKey(null);
      }
    }
    
  if (loading) {
    return (
      <div className="empty-state page-loader">
        <span className="spinner" />
        Henter din træningshistorik…
      </div>
    );
  }

  return (
    <div className="page-enter history-page">
      {/* HEADER */}
      <div className="page-header history-page-header">
        <div>
          <div className="eyebrow">DIN UDVIKLING</div>

          <h1>
            Tidligere træninger
            <span className="heading-dot">.</span>
          </h1>

          <p className="page-lead">
            Se dine gennemførte golftræninger og golf fitness-træninger samlet
            ét sted.
          </p>
        </div>

        <div className="page-header-icon">
          <Clock3 size={24} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* INGEN TRÆNINGER */}
      {sessions.length === 0 && !error && (
        <div className="history-empty">
          <div className="history-empty-icon">
            <Clock3 size={30} />
          </div>

          <h2>Ingen tidligere træninger endnu</h2>

          <p>
            Når du har gennemført din første golftræning eller Golf
            Fitness-træning, kan du finde den her.
          </p>

          <Link to="/planner" className="button button-primary">
            Planlæg min første træning
            <ArrowRight size={17} />
          </Link>
        </div>
      )}

      {/* TRÆNINGSHISTORIK */}
      {sessions.length > 0 && (
        <section className="history-list">
          <div className="history-section-heading">
            <div>
              <span className="eyebrow">TRÆNINGSLOG</span>
              <h2>Din træningshistorik</h2>
            </div>

            <span className="history-count">
              {sessions.length}{" "}
              {sessions.length === 1 ? "træning" : "træninger"}
            </span>
          </div>

          {sessions.map((session) => {
            const isOpen = openSessionKey === session.historyKey;
            const sessionDate = session.completed_at || session.created_at;

            const isFitness = session.type === "fitness";

            return (
              <article
                className={`history-session-card ${
                  isOpen ? "history-session-card-open" : ""
                }`}
                key={session.historyKey}
              >
                {/* HEADER */}
                <button
                  type="button"
                  className="history-session-header"
                  onClick={() => toggleSession(session.historyKey)}
                  aria-expanded={isOpen}
                >
                  <div className="history-session-date">
                    <div
                      className={`history-calendar-icon ${
                        isFitness ? "history-calendar-icon-fitness" : ""
                      }`}
                    >
                      {isFitness ? (
                        <Dumbbell size={19} />
                      ) : (
                        <Target size={19} />
                      )}
                    </div>

                    <div>
                      <span className="history-session-type">
                        {session.typeLabel}
                      </span>

                      <strong>
                        {session.title ||
                          (isFitness ? "Min golf fitness" : "Min træning")}
                      </strong>

                      <span className="history-session-date-text">
                        {formatShortDate(sessionDate)}
                      </span>
                    </div>
                  </div>

                  <div className="history-session-summary">
                    <div className="history-session-time">
                      <Clock3 size={16} />

                      <strong>
                        {formatRecordedTime(session.totalActualSeconds)}
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

                {/* FOKUSOMRÅDER */}
                {session.focusAreas.length > 0 && (
                  <div className="history-focus-tags">
                    {session.focusAreas.map((area) => (
                      <span key={area}>{area}</span>
                    ))}
                  </div>
                )}

                {/* DETALJER */}
                {isOpen && (
                  <div className="history-session-details">
                    <div className="history-detail-top">
                      <div>
                        <span className="eyebrow">
                          {session.typeLabel.toUpperCase()}
                        </span>

                        <h3>{formatDate(sessionDate)}</h3>

                        {isFitness && session.location && (
                          <p className="history-detail-location">
                            Træningssted: <strong>{session.location}</strong>
                          </p>
                        )}
                      </div>

                      <div className="history-total-time">
                        <span>Faktisk tid</span>

                        <strong>
                          {formatRecordedTime(session.totalActualSeconds)}
                        </strong>
                      </div>
                    </div>

                    <div className="history-exercise-list">
                      {session.exercises.map((exercise, index) => {
                        const fitnessPrescription = isFitness
                          ? formatFitnessPrescription(exercise)
                          : "";

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

                              {isFitness && fitnessPrescription && (
                                <p className="history-fitness-prescription">
                                  {fitnessPrescription}
                                </p>
                              )}

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
                              {isFitness ? (
                                <>
                                  {exercise.completed ? (
                                    <CheckCircle2 size={15} />
                                  ) : (
                                    <Target size={15} />
                                  )}

                                  <strong>
                                    {exercise.completed
                                      ? "Gennemført"
                                      : "Ikke gennemført"}
                                  </strong>
                                </>
                              ) : (
                                <>
                                  <Clock3 size={15} />

                                  <strong>
                                    {formatRecordedTime(
                                      exercise.actual_duration_seconds,
                                    )}
                                  </strong>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="history-actions">
                      <Link
                        to={session.route}
                        className="history-action history-action-secondary"
                      >
                        <ArrowRight size={16} />
                        Åbn træningen
                      </Link>

                      <button
                        type="button"
                        className="history-action history-action-primary"
                        onClick={() => repeatSession(session)}
                        disabled={repeatingSessionKey === session.historyKey}
                      >
                        <RotateCcw size={16} />

                        {repeatingSessionKey === session.historyKey
                          ? "Opretter træning..."
                          : "Gennemfør igen"}
                      </button>
                    </div>
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
