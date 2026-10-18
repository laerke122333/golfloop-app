import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  LoaderCircle,
  Pause,
  Play,
  Repeat2,
  Save,
  Target,
  Video,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

function formatTime(totalSeconds = 0) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function formatLongTime(totalSeconds = 0) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  if (minutes === 0) return `${remaining} sek.`;
  if (remaining === 0) return `${minutes} min.`;
  return `${minutes} min. ${remaining} sek.`;
}

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultItemId, setResultItemId] = useState(null);
  const [resultFeeling, setResultFeeling] = useState("okay");
  const [resultScore, setResultScore] = useState("");
  const [resultTotal, setResultTotal] = useState("10");

  const [activeItemId, setActiveItemId] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerStartedAtRef = useRef(null);
  const baseElapsedRef = useRef(0);
  const activeItemIdRef = useRef(null);
  const itemsRef = useRef([]);

  useEffect(() => {
    activeItemIdRef.current = activeItemId;
  }, [activeItemId]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Hent træningen robust: fejl ender altid med loading=false.
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setError("");
      setNotice("");

      if (!user?.id) {
        if (!cancelled) {
          setError("Du er ikke logget ind. Log ind igen og prøv på ny.");
          setLoading(false);
        }
        return;
      }

      if (!sessionId) {
        if (!cancelled) {
          setError(
            "Træningen mangler et ID. Gå tilbage til overblikket og åbn træningen derfra.",
          );
          setLoading(false);
        }
        return;
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from("training_sessions")
          .select(
            "id,title,duration_minutes,focus_areas,facility,status,created_at,completed_at,prioritize_recent_round",
          )
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (sessionError) throw sessionError;

        if (!sessionData) {
          throw new Error(
            "Træningen blev ikke fundet. Den kan være slettet, eller den tilhører en anden bruger.",
          );
        }

        const { data: exerciseData, error: exerciseError } = await supabase
          .from("training_session_exercises")
          .select(
            `
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
      result_feeling,
      result_score,
      result_total,
      actual_duration_seconds
    `,
          )
          .eq("session_id", sessionId)
          .order("position", { ascending: true });

        if (exerciseError) throw exerciseError;

        if (cancelled) return;

        setSession(sessionData);
        setItems(exerciseData || []);
        setActiveItemId(null);
        setTimerRunning(false);
        setElapsedSeconds(0);
        timerStartedAtRef.current = null;
        baseElapsedRef.current = 0;
      } catch (loadError) {
        if (!cancelled) {
          console.error("GolfLoop træningsfejl:", loadError);
          setError(`Træningen kunne ikke hentes: ${loadError.message}`);
          setSession(null);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [user?.id, sessionId]);

  const activeItem = items.find((item) => item.id === activeItemId) || null;
  const isCompleted = session?.status === "completed";
  const completedCount = items.filter((item) => item.completed).length;
  const progress = items.length ? (completedCount / items.length) * 100 : 0;

  function getCurrentElapsed() {
    if (!timerRunning || !timerStartedAtRef.current) return elapsedSeconds;

    return (
      baseElapsedRef.current +
      Math.floor((Date.now() - timerStartedAtRef.current) / 1000)
    );
  }

  async function saveItemTime(itemId, seconds) {
    if (!itemId) return false;

    const safeSeconds = Math.max(0, Math.floor(seconds));

    const nextItems = itemsRef.current.map((item) =>
      item.id === itemId
        ? { ...item, actual_duration_seconds: safeSeconds }
        : item,
    );

    itemsRef.current = nextItems;
    setItems(nextItems);

    const { error: updateError } = await supabase
      .from("training_session_exercises")
      .update({ actual_duration_seconds: safeSeconds })
      .eq("id", itemId);

    if (updateError) {
      setError(`Tiden kunne ikke gemmes: ${updateError.message}`);
      return false;
    }

    return true;
  }

  async function startExercise(itemId) {
    const selectedItem = itemsRef.current.find((item) => item.id === itemId);

    if (!selectedItem || selectedItem.completed || isCompleted) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      // Gem først tiden på den øvelse, der eventuelt kørte.
      if (
        activeItemIdRef.current &&
        activeItemIdRef.current !== itemId &&
        timerRunning
      ) {
        const saved = await pauseCurrentTimer(true);
        if (!saved) return;
      }

      // En planlagt træning bliver til "i gang", når første øvelse startes.
      if (session.status === "planned") {
        const { data: updatedSession, error: sessionError } = await supabase
          .from("training_sessions")
          .update({ status: "in_progress" })
          .eq("id", session.id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (sessionError) throw sessionError;

        setSession((current) => ({ ...current, ...updatedSession }));
      }

      const storedSeconds = Number(selectedItem.actual_duration_seconds || 0);

      activeItemIdRef.current = itemId;
      setActiveItemId(itemId);
      setElapsedSeconds(storedSeconds);
      baseElapsedRef.current = storedSeconds;
      timerStartedAtRef.current = Date.now();
      setTimerRunning(true);
    } catch (startError) {
      setError(`Øvelsen kunne ikke startes: ${startError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function pauseCurrentTimer(silent = false) {
    const itemId = activeItemIdRef.current;

    if (!itemId) return true;

    const currentElapsed = getCurrentElapsed();

    setElapsedSeconds(currentElapsed);
    setTimerRunning(false);
    timerStartedAtRef.current = null;
    baseElapsedRef.current = currentElapsed;

    const saved = await saveItemTime(itemId, currentElapsed);

    if (saved && !silent) {
      setNotice("Timeren er sat på pause.");
    }

    return saved;
  }

  async function toggleTimer() {
    if (!activeItem || isCompleted) return;

    setError("");

    if (timerRunning) {
      await pauseCurrentTimer(false);
      return;
    }

    baseElapsedRef.current = elapsedSeconds;
    timerStartedAtRef.current = Date.now();
    setTimerRunning(true);
    setNotice("");
  }

  async function finishExercise() {
    if (!activeItem || isCompleted) return;

    setSaving(true);
    setError("");
    setNotice("");

    async function completeExerciseWithoutTimer(itemId) {
      if (isCompleted) return;

      const item = itemsRef.current.find((exercise) => exercise.id === itemId);

      if (!item || item.completed) return;

      setSaving(true);
      setError("");
      setNotice("");

      try {
        const { error: updateError } = await supabase
          .from("training_session_exercises")
          .update({
            completed: true,
            actual_duration_seconds: Number(item.actual_duration_seconds || 0),
          })
          .eq("id", item.id);

        if (updateError) throw updateError;

        const nextItems = itemsRef.current.map((exercise) =>
          exercise.id === item.id
            ? {
                ...exercise,
                completed: true,
                actual_duration_seconds: Number(
                  exercise.actual_duration_seconds || 0,
                ),
              }
            : exercise,
        );

        itemsRef.current = nextItems;
        setItems(nextItems);

        setNotice(`${item.exercise_title} er markeret som færdig.`);
      } catch (completeError) {
        setError(
          `Øvelsen kunne ikke markeres som færdig: ${completeError.message}`,
        );
      } finally {
        setSaving(false);
      }
    }

    try {
      const finalSeconds = Math.max(0, Math.floor(getCurrentElapsed()));

      setElapsedSeconds(finalSeconds);
      setTimerRunning(false);
      timerStartedAtRef.current = null;
      baseElapsedRef.current = finalSeconds;

      // Gem tiden, men vent med at markere øvelsen som færdig.
      const { error: updateError } = await supabase
        .from("training_session_exercises")
        .update({
          actual_duration_seconds: finalSeconds,
        })
        .eq("id", activeItem.id);

      if (updateError) throw updateError;

      const nextItems = itemsRef.current.map((item) =>
        item.id === activeItem.id
          ? {
              ...item,
              actual_duration_seconds: finalSeconds,
            }
          : item,
      );

      itemsRef.current = nextItems;
      setItems(nextItems);

      // Åbn resultatvinduet
      setResultItemId(activeItem.id);
      setResultFeeling(activeItem.result_feeling || "okay");
      setResultScore(
        activeItem.result_score !== null &&
          activeItem.result_score !== undefined
          ? String(activeItem.result_score)
          : "",
      );
      setResultTotal(
        activeItem.result_total ? String(activeItem.result_total) : "10",
      );

      setResultModalOpen(true);
    } catch (finishError) {
      setError(`Øvelsen kunne ikke afsluttes: ${finishError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveExerciseResult() {
    if (!resultItemId) return;

    const currentItem = itemsRef.current.find(
      (item) => item.id === resultItemId,
    );

    if (!currentItem) return;

    const total = Math.max(1, Math.floor(Number(resultTotal) || 10));

    const score = resultScore === "" ? null : Math.floor(Number(resultScore));

    if (
      score !== null &&
      (!Number.isFinite(score) || score < 0 || score > total)
    ) {
      setError(`Resultatet skal være mellem 0 og ${total}.`);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: updateError } = await supabase
        .from("training_session_exercises")
        .update({
          completed: true,
          result_feeling: resultFeeling,
          result_score: score,
          result_total: score === null ? null : total,
          actual_duration_seconds: Number(
            currentItem.actual_duration_seconds || 0,
          ),
        })
        .eq("id", resultItemId);

      if (updateError) throw updateError;

      const nextItems = itemsRef.current.map((item) =>
        item.id === resultItemId
          ? {
              ...item,
              completed: true,
              result_feeling: resultFeeling,
              result_score: score,
              result_total: score === null ? null : total,
            }
          : item,
      );

      itemsRef.current = nextItems;
      setItems(nextItems);

      const finishedTitle = currentItem.exercise_title;
      const finalSeconds = Number(currentItem.actual_duration_seconds || 0);

      setResultModalOpen(false);
      setResultItemId(null);

      setActiveItemId(null);
      activeItemIdRef.current = null;
      setElapsedSeconds(0);
      baseElapsedRef.current = 0;

      setNotice(
        `${finishedTitle} er færdig. Du brugte ${formatLongTime(finalSeconds)}.`,
      );
    } catch (resultError) {
      setError(`Resultatet kunne ikke gemmes: ${resultError.message}`);
    } finally {
      setSaving(false);
    }
  }
  // Færdiggør en øvelse uden timer
  async function completeExerciseWithoutTimer(itemId) {
    if (isCompleted) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const selectedItem = itemsRef.current.find((item) => item.id === itemId);

      if (!selectedItem) return;

      const { error: updateError } = await supabase
        .from("training_session_exercises")
        .update({
          completed: true,
        })
        .eq("id", itemId);

      if (updateError) throw updateError;

      const nextItems = itemsRef.current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: true,
            }
          : item,
      );

      itemsRef.current = nextItems;
      setItems(nextItems);

      setNotice(`${selectedItem.exercise_title} er markeret som færdig.`);
    } catch (completeError) {
      setError(
        `Øvelsen kunne ikke markeres som færdig: ${completeError.message}`,
      );
    } finally {
      setSaving(false);
    }
  }

  function updateItem(itemId, field, value) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    );
    setNotice("");
  }

  async function saveExerciseNotes() {
    if (activeItemIdRef.current && timerRunning) {
      const saved = await pauseCurrentTimer(true);
      if (!saved) return false;
    }

    setSaving(true);
    setError("");

    try {
      for (const item of itemsRef.current) {
        const score =
          item.result_score === "" ||
          item.result_score === null ||
          item.result_score === undefined
            ? null
            : Number(item.result_score);

        const total =
          item.result_total === "" ||
          item.result_total === null ||
          item.result_total === undefined
            ? null
            : Number(item.result_total);

        const { error: updateError } = await supabase
          .from("training_session_exercises")
          .update({
            completed: item.completed,
            result_notes: item.result_notes || null,
            result_feeling: item.result_feeling || null,
            result_score: score,
            result_total: total,
            actual_duration_seconds: Number(item.actual_duration_seconds || 0),
          })
          .eq("id", item.id);

        if (updateError) throw updateError;
      }

      setNotice("Dine resultater og tider er gemt.");
      return true;
    } catch (saveError) {
      setError(`Resultaterne kunne ikke gemmes: ${saveError.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function completeTraining() {
    if (!session || items.length === 0) {
      return;
    }

    const allSaved = await saveExerciseNotes();
    if (!allSaved) return;

    setSaving(true);
    setError("");

    async function saveAndGoHome() {
      const saved = await saveExerciseNotes();

      if (saved) {
        navigate("/");
      }
    }
    try {
      const { data, error: updateError } = await supabase
        .from("training_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setSession((current) => ({
        ...current,
        ...data,
      }));

      setActiveItemId(null);
      activeItemIdRef.current = null;
      setTimerRunning(false);
      timerStartedAtRef.current = null;

      setNotice("Flot arbejde! Træningen er markeret som gennemført.");

      navigate("/");
    } catch (completeError) {
      setError(`Træningen kunne ikke afsluttes: ${completeError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function repeatTraining() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
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

      const { error: insertError } = await supabase
        .from("training_session_exercises")
        .insert(newExercises);

      if (insertError) {
        await supabase
          .from("training_sessions")
          .delete()
          .eq("id", newSession.id)
          .eq("user_id", user.id);

        throw insertError;
      }

      navigate(`/sessions/${newSession.id}`);
    } catch (repeatError) {
      console.error("Fejl ved gentagelse af træning:", repeatError);

      setError(`Træningen kunne ikke gentages: ${repeatError.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Opdater den synlige timer 4 gange i sekundet.
  useEffect(() => {
    if (!timerRunning) return undefined;

    const interval = window.setInterval(() => {
      setElapsedSeconds(getCurrentElapsed());
    }, 250);

    return () => window.clearInterval(interval);
  }, [timerRunning]);

  // Gem tiden løbende, så den også kan ses senere.
  useEffect(() => {
    if (!timerRunning || !activeItemId) return undefined;

    const interval = window.setInterval(async () => {
      const currentElapsed = getCurrentElapsed();
      setElapsedSeconds(currentElapsed);
      await saveItemTime(activeItemIdRef.current, currentElapsed);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [timerRunning, activeItemId]);

  if (loading) {
    return (
      <div className="empty-state page-loader">
        <span className="spinner" />
        Henter din træning…
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="empty-state">
        <h2>Der opstod et problem</h2>
        <p>{error}</p>
        <Link to="/" className="button button-primary">
          Tilbage til overblik
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="empty-state">
        <h2>Træningen blev ikke fundet</h2>
        <p>Gå tilbage til overblikket og åbn træningen igen.</p>
        <Link to="/" className="button button-primary">
          Tilbage til overblik
        </Link>
      </div>
    );
  }

  const showStartChooser = !isCompleted && !activeItem;

  return (
    <div className="page-enter session-detail-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Tilbage til overblik
      </Link>

      <div className="session-detail-hero">
        <div className="session-detail-hero-copy">
          <div className="eyebrow">DIN TRÆNINGSPLAN</div>

          <h1>
            {session.title || "Min træning"}
            <span className="heading-dot">.</span>
          </h1>

          <p className="page-lead">
            Vælg selv, hvad du starter med. Brug timeren på hver øvelse og
            markér den som færdig, når du er klar.
          </p>

          <div className="session-summary-tags">
            <span>
              <Clock3 size={15} /> {session.duration_minutes} minutter planlagt
            </span>
            <span>
              <Target size={15} /> {items.length} øvelser
            </span>
            <span>
              <Flag size={15} /> {session.facility}
            </span>
          </div>
        </div>

        <div className={`status-pill status-${session.status}`}>
          {isCompleted
            ? "Gennemført"
            : session.status === "in_progress"
              ? "I gang"
              : "Planlagt"}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {notice && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      <div className="session-progress-panel">
        <div className="progress-panel-copy">
          <strong>Din fremgang</strong>
          <span>
            {completedCount} af {items.length} øvelser markeret som gennemført
          </span>
        </div>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {activeItem && (
        <section className="active-exercise-panel">
          <div className="eyebrow">AKTIV ØVELSE</div>

          <h2>{activeItem.exercise_title}</h2>

          <p>{activeItem.description}</p>

          <div className="active-timer">
            <Clock3 size={20} />
            <strong>{formatTime(elapsedSeconds)}</strong>
            <span>brugt på denne øvelse</span>
          </div>

          <div className="active-timer-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={toggleTimer}
              disabled={saving}
            >
              {timerRunning ? (
                <>
                  <Pause size={17} /> Pause timer
                </>
              ) : (
                <>
                  <Play size={17} /> Start timer igen
                </>
              )}
            </button>

            <button
              type="button"
              className="button button-primary"
              onClick={finishExercise}
              disabled={saving}
            >
              {saving ? (
                <>
                  <LoaderCircle size={17} className="spin" /> Gemmer…
                </>
              ) : (
                <>
                  <Check size={17} /> Markér øvelse som færdig
                </>
              )}
            </button>
          </div>
        </section>
      )}

      <div className="session-exercises-list">
        {items.map((item, index) => {
          const isActive = item.id === activeItemId;
          const spent = Number(item.actual_duration_seconds || 0);

          return (
            <article
              className={`session-exercise-card ${
                item.completed ? "session-exercise-done" : ""
              } ${isActive ? "session-exercise-active" : ""}`}
              key={item.id}
            >
              <div className="session-exercise-header">
                <div className="session-exercise-number">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="session-exercise-title">
                  <span className="planned-category">
                    {item.category} · {item.duration_minutes} min.
                  </span>

                  <span className="session-exercise-name">
                    <h2>{item.exercise_title}</h2>

                    {item.exercise?.video_id && (
                      <Video
                        size={17}
                        strokeWidth={2}
                        aria-label="Har instruktionsvideo"
                        title="Har instruktionsvideo"
                      />
                    )}
                  </span>

                  <p>{item.description}</p>
                </div>

                <div className="completed-checkbox">
                  {item.completed ? (
                    <>
                      <CheckCircle2 size={20} />
                      <small>Færdig</small>
                    </>
                  ) : isActive ? (
                    <>
                      <Clock3 size={20} />
                      <small>I gang</small>
                    </>
                  ) : null}
                </div>
              </div>

              <div
                className={`exercise-time-row ${isActive ? "is-active" : ""}`}
              >
                <div className="exercise-time-info">
                  <span>
                    <Clock3 size={16} />
                    Tid brugt
                  </span>

                  <strong>
                    {isActive
                      ? formatTime(elapsedSeconds)
                      : spent
                        ? formatLongTime(spent)
                        : "Ikke startet"}
                  </strong>
                </div>

                {isActive && !item.completed && (
                  <div className="exercise-time-actions">
                    <button
                      type="button"
                      className="timer-button timer-button-pause"
                      onClick={toggleTimer}
                      disabled={saving}
                    >
                      {timerRunning ? (
                        <>
                          <Pause size={16} />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play size={16} />
                          Start igen
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className="timer-button timer-button-finish"
                      onClick={finishExercise}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <LoaderCircle size={16} className="spin" />
                          Gemmer…
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          Færdig
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {item.instructions?.length > 0 && (
                <details className="session-instructions">
                  <summary>Vis øvelsen trin for trin</summary>

                  {item.exercise?.video_id && (
                    <div className="session-exercise-video">
                      <h3>Se øvelsen</h3>

                      <div className="session-exercise-video-frame">
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${item.exercise.video_id}`}
                          title={`Instruktionsvideo til ${item.exercise_title}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}

                  <ol>
                    {item.instructions.map((step, stepIndex) => (
                      <li key={`${item.id}-${stepIndex}`}>{step}</li>
                    ))}
                  </ol>
                </details>
              )}

              <label className="field-label" htmlFor={`result-${item.id}`}>
                Dine resultater / noter
              </label>

              <textarea
                id={`result-${item.id}`}
                className="plain-textarea result-textarea"
                rows={2}
                value={item.result_notes || ""}
                onChange={(event) =>
                  updateItem(item.id, "result_notes", event.target.value)
                }
                placeholder="Fx 7 ud af 10 putts i hul fra én meter…"
                disabled={isCompleted}
              />

              {!isCompleted && !item.completed && !isActive && (
                <div className="session-exercise-actions">
                  <button
                    type="button"
                    className="button button-outline session-exercise-start-button"
                    onClick={() => startExercise(item.id)}
                    disabled={saving}
                  >
                    <Play size={16} /> Start med timer
                  </button>

                  <button
                    type="button"
                    className="button button-primary session-exercise-finish-button"
                    onClick={() => completeExerciseWithoutTimer(item.id)}
                    disabled={saving}
                  >
                    <Check size={16} /> Markér som færdig
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="session-actions">
        {!isCompleted && (
          <button
            className="button button-outline"
            onClick={async () => {
              const saved = await saveExerciseNotes();

              if (saved) {
                navigate("/");
              }
            }}
            disabled={saving}
          >
            <Save size={17} /> Gem resultater
          </button>
        )}

        {!isCompleted && (
          <button
            className="button button-primary"
            onClick={completeTraining}
            disabled={saving || items.length === 0}
          >
            {saving ? (
              <>
                <LoaderCircle size={17} className="spin" /> Gemmer…
              </>
            ) : (
              <>
                <CheckCircle2 size={18} /> Markér træning som gennemført
              </>
            )}
          </button>
        )}

        {isCompleted && (
          <div className="completed-message">
            <CheckCircle2 size={19} /> Træning gennemført — godt arbejde!
          </div>
        )}
      </div>

      {isCompleted && (
        <div className="training-time-summary">
          <div>
            <div className="eyebrow">DIN TRÆNING I TAL</div>
            <h2>Så lang tid brugte du</h2>
            <p>Her kan du se den faktiske tid, du brugte på hver øvelse.</p>
          </div>

          <div className="training-time-summary-list">
            {items.map((item, index) => (
              <div className="training-time-summary-row" key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.exercise_title}</strong>
                <b>
                  {formatLongTime(Number(item.actual_duration_seconds || 0))}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="next-step-card">
          <div>
            <strong>Klar til næste skridt?</strong>
            <p>Gentag en træning, du kunne lide, eller planlæg en helt ny.</p>
          </div>

          <div className="next-step-actions">
            <button
              className="button button-outline"
              onClick={repeatTraining}
              disabled={saving}
            >
              <Repeat2 size={17} />
              {saving ? "Opretter…" : "Gennemfør igen"}
            </button>

            <button
              className="button button-primary"
              onClick={() => navigate("/planner")}
            >
              Planlæg næste træning
            </button>
          </div>
        </div>
      )}

      {resultModalOpen && (
        <div
          className="result-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-modal-title"
        >
          <div className="result-modal">
            <div className="result-modal-eyebrow">ØVELSE FÆRDIG</div>

            <h2 id="result-modal-title">Hvordan gik det?</h2>

            <p className="result-modal-exercise">
              {items.find((item) => item.id === resultItemId)?.exercise_title}
            </p>

            <div className="result-feeling-grid">
              <button
                type="button"
                className={`result-feeling-button ${
                  resultFeeling === "easy" ? "selected" : ""
                }`}
                onClick={() => setResultFeeling("easy")}
              >
                <span>😊</span>
                <strong>Nem</strong>
              </button>

              <button
                type="button"
                className={`result-feeling-button ${
                  resultFeeling === "okay" ? "selected" : ""
                }`}
                onClick={() => setResultFeeling("okay")}
              >
                <span>😐</span>
                <strong>Okay</strong>
              </button>

              <button
                type="button"
                className={`result-feeling-button ${
                  resultFeeling === "hard" ? "selected" : ""
                }`}
                onClick={() => setResultFeeling("hard")}
              >
                <span>😕</span>
                <strong>Svær</strong>
              </button>
            </div>

            <div className="result-score-section">
              <label className="field-label">
                Hvor mange ramte du?
                <span className="optional-label">Valgfrit</span>
              </label>

              <div className="result-score-inputs">
                <input
                  type="number"
                  min="0"
                  max={resultTotal}
                  value={resultScore}
                  onChange={(event) => setResultScore(event.target.value)}
                  placeholder="7"
                />

                <span>/</span>

                <input
                  type="number"
                  min="1"
                  value={resultTotal}
                  onChange={(event) => setResultTotal(event.target.value)}
                />
              </div>

              <p className="result-score-help">
                Du kan springe scoren over, hvis øvelsen ikke passer til en
                bestemt score.
              </p>
            </div>

            <div className="result-modal-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setResultModalOpen(false);
                  setResultItemId(null);
                }}
                disabled={saving}
              >
                Tilbage
              </button>

              <button
                type="button"
                className="button button-primary"
                onClick={saveExerciseResult}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <LoaderCircle size={17} className="spin" />
                    Gemmer…
                  </>
                ) : (
                  <>
                    <Check size={17} />
                    Gem resultat
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}