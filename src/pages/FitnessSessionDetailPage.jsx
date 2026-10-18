import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  Clock3,
  Dumbbell,
  Home,
  Pause,
  Play,
  Square,
  Video,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./FitnessSessionDetailPage.css";

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0",
    )}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

function formatShortDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sek.`;
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${remainingSeconds} sek.`;
}

function getLocationIcon(location) {
  return location === "Fitnesscenter" ? Building2 : Home;
}

export default function FitnessSessionDetailPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [exercises, setExercises] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(0);

  const [, setTimerTick] = useState(0);

  const [isRunning, setIsRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState(null);
  const [pausedAt, setPausedAt] = useState(null);

  const [savingExerciseId, setSavingExerciseId] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const [videoExercise, setVideoExercise] = useState(null);

  const [finished, setFinished] = useState(false);
  const [finalDuration, setFinalDuration] = useState(0);

  /*
   * -------------------------------------------------------
   * LOAD SESSION
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!user || !sessionId) return;

    loadSession();
  }, [user, sessionId]);

  async function loadSession() {
    setLoading(true);
    setErrorMessage("");

    const { data: sessionData, error: sessionError } = await supabase
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
            started_at,
            completed_at,
            notes,
            created_at
          `,
      )
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError || !sessionData) {
      console.error(sessionError);

      setErrorMessage("Vi kunne ikke finde denne træning.");

      setLoading(false);
      return;
    }

    const { data: exerciseData, error: exerciseError } = await supabase
      .from("fitness_session_exercises")
      .select(
        `
            id,
            session_id,
            exercise_id,
            exercise_title,
            category,
            description,
            instructions,
            sets,
            reps,
            duration_seconds,
            rest_seconds,
            position,
            completed,
            actual_sets,
            actual_reps,
            weight_kg,
            result_notes
          `,
      )
      .eq("session_id", sessionId)
      .order("position", { ascending: true });

    if (exerciseError) {
      console.error(exerciseError);

      setErrorMessage("Vi kunne ikke hente øvelserne til træningen.");

      setLoading(false);
      return;
    }

    setSession(sessionData);
    setExercises(exerciseData || []);

    setElapsedSeconds(sessionData.actual_duration_seconds || 0);

    setPausedSeconds(sessionData.paused_duration_seconds || 0);

    /*
     * Hvis træningen allerede er afsluttet,
     * viser vi resultatet med det samme.
     */
    if (sessionData.status === "completed") {
      setFinalDuration(sessionData.actual_duration_seconds || 0);

      setFinished(true);
    }

    /*
     * Hvis brugeren forlod en træning, der var
     * in_progress, starter vi IKKE automatisk timeren igen.
     *
     * Brugeren får i stedet mulighed for at trykke
     * "Fortsæt træning".
     */
    setIsRunning(false);
    setRunStartedAt(null);
    setPausedAt(null);

    setLoading(false);
  }

  /*
   * -------------------------------------------------------
   * TIMER
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!isRunning || !runStartedAt) return;

    const intervalId = window.setInterval(() => {
      setTimerTick((tick) => tick + 1);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isRunning, runStartedAt]);

  /*
   * -------------------------------------------------------
   * CALCULATE CURRENT ELAPSED TIME
   * -------------------------------------------------------
   */

  function getCurrentElapsedSeconds() {
    if (!isRunning || !runStartedAt) {
      return elapsedSeconds;
    }

    return elapsedSeconds + Math.floor((Date.now() - runStartedAt) / 1000);
  }

  /*
   * -------------------------------------------------------
   * START / RESUME
   * -------------------------------------------------------
   */

  async function startWorkout() {
    if (!session || finished) return;

    const now = Date.now();

    /*
     * Første gang træningen startes,
     * gemmer vi started_at.
     */
    if (!session.started_at) {
      const startedAtIso = new Date(now).toISOString();

      const { error } = await supabase
        .from("fitness_sessions")
        .update({
          status: "in_progress",
          started_at: startedAtIso,
        })
        .eq("id", session.id)
        .eq("user_id", user.id);

      if (error) {
        console.error(error);

        setErrorMessage("Træningen kunne ikke startes.");

        return;
      }

      setSession((current) => ({
        ...current,
        status: "in_progress",
        started_at: startedAtIso,
      }));
    } else {
      /*
       * Hvis træningen allerede var startet tidligere,
       * fortsætter vi blot.
       */
      await supabase
        .from("fitness_sessions")
        .update({
          status: "in_progress",
        })
        .eq("id", session.id)
        .eq("user_id", user.id);
    }

    /*
     * Hvis vi havde en pause, registrerer vi
     * hvor lang pausen var.
     */
    let updatedPausedSeconds = pausedSeconds;

    if (pausedAt) {
      updatedPausedSeconds += Math.floor((now - pausedAt) / 1000);

      setPausedSeconds(updatedPausedSeconds);

      await supabase
        .from("fitness_sessions")
        .update({
          paused_duration_seconds: updatedPausedSeconds,
        })
        .eq("id", session.id)
        .eq("user_id", user.id);
    }

    setPausedAt(null);
    setRunStartedAt(now);
    setIsRunning(true);
    setErrorMessage("");
  }

  /*
   * -------------------------------------------------------
   * PAUSE
   * -------------------------------------------------------
   */

  async function pauseWorkout() {
    if (!isRunning || !runStartedAt || !session) {
      return;
    }

    const now = Date.now();

    const currentElapsed =
      elapsedSeconds + Math.floor((now - runStartedAt) / 1000);

    setElapsedSeconds(currentElapsed);

    setIsRunning(false);
    setRunStartedAt(null);
    setPausedAt(now);

    const { error } = await supabase
      .from("fitness_sessions")
      .update({
        status: "in_progress",
        actual_duration_seconds: currentElapsed,
      })
      .eq("id", session.id)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);

      setErrorMessage("Træningstiden kunne ikke gemmes.");
    }
  }

  /*
   * -------------------------------------------------------
   * TOGGLE EXERCISE
   * -------------------------------------------------------
   */

  async function toggleExercise(exercise) {
    if (finished) return;

    const newCompleted = !exercise.completed;

    setExercises((current) =>
      current.map((item) =>
        item.id === exercise.id
          ? {
              ...item,
              completed: newCompleted,
            }
          : item,
      ),
    );

    setSavingExerciseId(exercise.id);

    const { error } = await supabase
      .from("fitness_session_exercises")
      .update({
        completed: newCompleted,
      })
      .eq("id", exercise.id)
      .eq("session_id", sessionId);

    if (error) {
      console.error(error);

      /*
       * Hvis Supabase fejler,
       * ruller vi UI'et tilbage.
       */
      setExercises((current) =>
        current.map((item) =>
          item.id === exercise.id
            ? {
                ...item,
                completed: exercise.completed,
              }
            : item,
        ),
      );

      setErrorMessage("Status på øvelsen kunne ikke gemmes.");
    }

    setSavingExerciseId(null);
  }

  /*
   * -------------------------------------------------------
   * FINISH WORKOUT
   * -------------------------------------------------------
   *
   * VIGTIGT:
   *
   * Denne funktion kræver IKKE:
   * - at timeren er startet
   * - at timeren har kørt
   * - at alle øvelser er gennemført
   *
   * Brugeren kan altid afslutte.
   */

  async function finishWorkout() {
    if (!session || finishing || finished) {
      return;
    }

    setFinishing(true);
    setErrorMessage("");

    const now = Date.now();

    let finalElapsedSeconds = getCurrentElapsedSeconds();

    let finalPausedSeconds = pausedSeconds;

    /*
     * Hvis brugeren afslutter mens træningen er paused,
     * tæller den nuværende pause med i paused_duration_seconds.
     */
    if (pausedAt && !isRunning) {
      finalPausedSeconds += Math.floor((now - pausedAt) / 1000);
    }

    /*
     * Hvis timeren aldrig blev startet,
     * er finalElapsedSeconds bare 0.
     *
     * Det er helt OK.
     */
    const { error: sessionError } = await supabase
      .from("fitness_sessions")
      .update({
        status: "completed",
        actual_duration_seconds: finalElapsedSeconds,
        paused_duration_seconds: finalPausedSeconds,
        completed_at: new Date(now).toISOString(),
      })
      .eq("id", session.id)
      .eq("user_id", user.id);

    if (sessionError) {
      console.error(sessionError);

      setErrorMessage("Træningen kunne ikke afsluttes. Prøv igen.");

      setFinishing(false);
      return;
    }

    /*
     * Gem også den aktuelle træningstid lokalt,
     * så resultatsiden kan vise den.
     */
    setElapsedSeconds(finalElapsedSeconds);
    setPausedSeconds(finalPausedSeconds);
    setFinalDuration(finalElapsedSeconds);

    setIsRunning(false);
    setRunStartedAt(null);
    setPausedAt(null);

    setSession((current) => ({
      ...current,
      status: "completed",
      actual_duration_seconds: finalElapsedSeconds,
      paused_duration_seconds: finalPausedSeconds,
      completed_at: new Date(now).toISOString(),
    }));

    setFinished(true);
    setFinishing(false);
  }

  /*
   * -------------------------------------------------------
   * COUNTERS
   * -------------------------------------------------------
   */

  const completedCount = useMemo(
    () => exercises.filter((exercise) => exercise.completed).length,
    [exercises],
  );

  const totalCount = exercises.length;

  const progressPercentage =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  /*
   * -------------------------------------------------------
   * LOADING
   * -------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="fitness-session-page">
        <div className="fitness-session-loading">Henter din træning...</div>
      </div>
    );
  }

  /*
   * -------------------------------------------------------
   * ERROR / NO SESSION
   * -------------------------------------------------------
   */

  if (!session) {
    return (
      <div className="fitness-session-page">
        <div className="fitness-session-container">
          <div className="fitness-session-error-card">
            <Dumbbell size={28} />

            <h2>Træningen blev ikke fundet</h2>

            <p>{errorMessage}</p>

            <button type="button" onClick={() => navigate("/golf-fitness")}>
              Tilbage til Golf Fitness
            </button>
          </div>
        </div>
      </div>
    );
  }

  const LocationIcon = getLocationIcon(session.location);

  /*
   * -------------------------------------------------------
   * FINISHED VIEW
   * -------------------------------------------------------
   */

  if (finished) {
    return (
      <div className="fitness-session-page">
        <div className="fitness-session-container">
          <button
            type="button"
            className="fitness-session-back"
            onClick={() => navigate("/golf-fitness")}
          >
            <ArrowLeft size={18} />
            Golf Fitness
          </button>

          <div className="fitness-complete-card">
            <div className="fitness-complete-icon">
              <Check size={34} />
            </div>

            <span className="fitness-complete-eyebrow">TRÆNING AFSLUTTET</span>

            <h1>{session.title}</h1>

            <p className="fitness-complete-intro">
              Godt arbejde! Din træning er gemt i GolfLoop.
            </p>

            <div className="fitness-complete-stats">
              <div>
                <Clock3 size={19} />

                <strong>
                  {finalDuration > 0
                    ? formatShortDuration(finalDuration)
                    : "Ikke registreret"}
                </strong>

                <span>Træningstid</span>
              </div>

              <div>
                <Check size={19} />

                <strong>
                  {completedCount}/{totalCount}
                </strong>

                <span>Øvelser</span>
              </div>

              <div>
                <LocationIcon size={19} />

                <strong>{session.location}</strong>

                <span>Sted</span>
              </div>
            </div>

            <div className="fitness-complete-progress">
              <div className="fitness-progress-header">
                <span>Gennemført</span>

                <strong>{progressPercentage}%</strong>
              </div>

              <div className="fitness-progress-bar">
                <div
                  style={{
                    width: `${progressPercentage}%`,
                  }}
                />
              </div>
            </div>

            <div className="fitness-complete-actions">
              <button
                type="button"
                className="fitness-primary-button"
                onClick={() => navigate("/golf-fitness")}
              >
                Til Golf Fitness
              </button>

              <button
                type="button"
                className="fitness-secondary-button"
                onClick={() => navigate("/history")}
              >
                Se tidligere træninger
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /*
   * -------------------------------------------------------
   * ACTIVE VIEW
   * -------------------------------------------------------
   */

  return (
    <div className="fitness-session-page">
      <div className="fitness-session-container">
        {/* BACK */}
        <button
          type="button"
          className="fitness-session-back"
          onClick={() => navigate("/golf-fitness")}
        >
          <ArrowLeft size={18} />
          Golf Fitness
        </button>

        {/* HEADER */}
        <header className="fitness-session-header">
          <div>
            <span className="fitness-session-eyebrow">GOLF FITNESS</span>

            <h1>{session.title}</h1>

            <div className="fitness-session-meta">
              <span>
                <LocationIcon size={15} />
                {session.location}
              </span>

              <span>
                <Dumbbell size={15} />
                {session.goal}
              </span>

              {session.planned_duration_minutes && (
                <span>
                  <Clock3 size={15} />
                  Mål: {session.planned_duration_minutes} min
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ERROR */}
        {errorMessage && (
          <div className="fitness-session-message">
            <span>{errorMessage}</span>

            <button type="button" onClick={() => setErrorMessage("")}>
              <X size={17} />
            </button>
          </div>
        )}

        {/* TIMER */}
        <section className="fitness-timer-card">
          <span className="fitness-timer-label">SAMLET TRÆNINGSTID</span>

          <div className="fitness-timer">
            {formatDuration(getCurrentElapsedSeconds())}
          </div>

          <p>
            Timeren måler kun den tid, du aktivt træner. Pauser tæller ikke med.
          </p>

          <div className="fitness-timer-actions">
            {!isRunning ? (
              <button
                type="button"
                className="fitness-start-button"
                onClick={startWorkout}
              >
                <Play size={22} fill="currentColor" />

                {session.started_at ? "Fortsæt træning" : "Start træning"}
              </button>
            ) : (
              <button
                type="button"
                className="fitness-pause-button"
                onClick={pauseWorkout}
              >
                <Pause size={22} fill="currentColor" />
                Pause
              </button>
            )}
          </div>

          {isRunning && (
            <div className="fitness-running-indicator">
              <span />
              Træningen er i gang
            </div>
          )}

          {!isRunning && session.started_at && elapsedSeconds > 0 && (
            <div className="fitness-paused-indicator">
              <Pause size={14} />
              Træningen er sat på pause
            </div>
          )}
        </section>

        {/* PROGRESS */}
        <section className="fitness-progress-card">
          <div className="fitness-progress-top">
            <div>
              <span>DIN TRÆNING</span>

              <strong>
                {completedCount} af {totalCount}
              </strong>
            </div>

            <div className="fitness-progress-percent">
              {progressPercentage}%
            </div>
          </div>

          <div className="fitness-progress-bar">
            <div
              style={{
                width: `${progressPercentage}%`,
              }}
            />
          </div>
        </section>

        {/* EXERCISES */}
        <section className="fitness-active-exercises">
          <div className="fitness-active-heading">
            <div>
              <span>PROGRAM</span>

              <h2>Dine øvelser</h2>
            </div>

            <span>{totalCount} øvelser</span>
          </div>

          <div className="fitness-active-list">
            {exercises.map((exercise, index) => (
              <article
                key={exercise.id}
                className={`fitness-active-exercise ${
                  exercise.completed ? "completed" : ""
                }`}
              >
                <button
                  type="button"
                  className="fitness-check-button"
                  onClick={() => toggleExercise(exercise)}
                  disabled={savingExerciseId === exercise.id}
                  aria-label={
                    exercise.completed
                      ? `Markér ${exercise.exercise_title} som ikke gennemført`
                      : `Markér ${exercise.exercise_title} som gennemført`
                  }
                >
                  {exercise.completed && <Check size={20} />}
                </button>

                <div className="fitness-active-number">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="fitness-active-content">
                  <div className="fitness-active-category">
                    {exercise.category}
                  </div>

                  <h3>{exercise.exercise_title}</h3>

                  {exercise.description && <p>{exercise.description}</p>}

                  <div className="fitness-active-details">
                    <span>{exercise.sets} sæt</span>

                    {exercise.reps && <span>{exercise.reps} reps</span>}

                    {exercise.duration_seconds && (
                      <span>{exercise.duration_seconds} sek.</span>
                    )}

                    {exercise.rest_seconds > 0 && (
                      <span>{exercise.rest_seconds}s pause</span>
                    )}
                  </div>
                </div>

                <div className="fitness-active-actions">
                  {exercise.exercise_id && (
                    <button
                      type="button"
                      className="fitness-video-button"
                      onClick={async () => {
                        const { data } = await supabase
                          .from("fitness_exercises")
                          .select("video_url,video_source,title")
                          .eq("id", exercise.exercise_id)
                          .maybeSingle();

                        if (data?.video_url) {
                          setVideoExercise({
                            title: exercise.exercise_title,
                            video_url: data.video_url,
                            video_source: data.video_source,
                          });
                        }
                      }}
                    >
                      <Video size={17} />
                      Video
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FINISH */}
        <section className="fitness-finish-section">
          <div className="fitness-finish-info">
            <Square size={18} />

            <div>
              <strong>Færdig med træningen?</strong>

              <span>
                Du kan afslutte når som helst. Du behøver ikke have startet
                timeren, og du behøver ikke gennemføre alle øvelser.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="fitness-finish-button"
            onClick={finishWorkout}
            disabled={finishing}
          >
            {finishing ? "Gemmer..." : "Afslut træning"}
          </button>
        </section>
      </div>

      {/* VIDEO MODAL */}
      {videoExercise && (
        <div
          className="fitness-video-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setVideoExercise(null);
            }
          }}
        >
          <div className="fitness-video-modal">
            <div className="fitness-video-modal-header">
              <div>
                <span>VIDEOGUIDE</span>

                <h2>{videoExercise.title}</h2>
              </div>

              <button
                type="button"
                onClick={() => setVideoExercise(null)}
                aria-label="Luk video"
              >
                <X size={20} />
              </button>
            </div>

            <div className="fitness-video-frame">
              <iframe
                src={videoExercise.video_url}
                title={`Videoguide til ${videoExercise.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            {videoExercise.video_source && (
              <p className="fitness-video-source">
                Kilde: {videoExercise.video_source}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
