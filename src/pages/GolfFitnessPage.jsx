import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  Clock3,
  Dumbbell,
  Filter,
  Home,
  Plus,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./GolfFitnessPage.css";

const LOCATION_OPTIONS = [
  {
    value: "Hjemme",
    label: "Hjemme",
    description: "Træn med det udstyr du har derhjemme",
    icon: Home,
  },
  {
    value: "Fitnesscenter",
    label: "Fitnesscenter",
    description: "Adgang til vægte, kabel og maskiner",
    icon: Building2,
  },
];

const GOAL_OPTIONS = [
  "Styrke",
  "Power & svinghastighed",
  "Rotation",
  "Stabilitet & balance",
  "Mobilitet",
  "Generel golfperformance",
];

const CATEGORY_OPTIONS = [
  "Alle",
  "Styrke",
  "Power",
  "Rotation",
  "Stabilitet",
  "Mobilitet",
];

const TIME_OPTIONS = [15, 30, 45, 60, 90];

function formatEquipment(equipment = []) {
  if (!equipment.length) return "Ingen særligt udstyr";

  return equipment.join(" · ");
}

function estimateExerciseSeconds(exercise) {
  const sets = exercise.sets || 1;
  const rest = exercise.rest_seconds || 0;

  if (exercise.duration_seconds) {
    return sets * exercise.duration_seconds + Math.max(0, sets - 1) * rest;
  }

  const reps = exercise.reps || 8;

  // Groft estimat til planlæggeren.
  const secondsPerSet = Math.max(30, reps * 4);

  return sets * secondsPerSet + Math.max(0, sets - 1) * rest;
}

function formatMinutes(seconds) {
  const minutes = Math.round(seconds / 60);

  if (minutes < 1) {
    return "< 1 min";
  }

  return `${minutes} min`;
}

export default function GolfFitnessPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exercises, setExercises] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);

  const [location, setLocation] = useState("Hjemme");
  const [goals, setGoals] = useState(["Generel golfperformance"]);
  const [plannedDuration, setPlannedDuration] = useState(30);

  const [category, setCategory] = useState("Alle");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [title, setTitle] = useState("Min golf fitness");

  useEffect(() => {
    loadExercises();
  }, []);

  async function loadExercises() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("fitness_exercises")
      .select(
        `
          id,
          title,
          description,
          category,
          goals,
          available_locations,
          difficulty,
          equipment,
          instructions,
          sets,
          reps,
          duration_seconds,
          rest_seconds,
          golf_benefit,
          movement_pattern,
          video_url,
          video_source,
          thumbnail_url
        `,
      )
      .eq("is_default", true)
      .order("category")
      .order("title");

    if (error) {
      console.error(error);
      setErrorMessage("Vi kunne ikke hente Golf Fitness-øvelserne. Prøv igen.");
      setExercises([]);
    } else {
      setExercises(data || []);
    }

    setLoading(false);
  }

  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return exercises.filter((exercise) => {
      const matchesLocation = exercise.available_locations?.includes(location);

      const matchesCategory =
        category === "Alle" || exercise.category === category;

      const matchesSearch =
        !normalizedSearch ||
        exercise.title.toLowerCase().includes(normalizedSearch) ||
        exercise.description?.toLowerCase().includes(normalizedSearch) ||
        exercise.golf_benefit?.toLowerCase().includes(normalizedSearch);

      return matchesLocation && matchesCategory && matchesSearch;
    });
  }, [exercises, location, category, search]);

  const estimatedSeconds = useMemo(() => {
    return selectedExercises.reduce(
      (total, exercise) => total + estimateExerciseSeconds(exercise),
      0,
    );
  }, [selectedExercises]);

  const estimatedMinutes = Math.round(estimatedSeconds / 60);

  const durationDifference = estimatedMinutes - plannedDuration;

  function isSelected(exerciseId) {
    return selectedExercises.some((exercise) => exercise.id === exerciseId);
  }

  function toggleGoal(goal) {
    setGoals((currentGoals) => {
      if (currentGoals.includes(goal)) {
        return currentGoals.filter((item) => item !== goal);
      }

      return [...currentGoals, goal];
    });
  }

  function addExercise(exercise) {
    if (isSelected(exercise.id)) return;

    setSelectedExercises((current) => [...current, exercise]);
    setSuccessMessage("");
  }

  function removeExercise(exerciseId) {
    setSelectedExercises((current) =>
      current.filter((exercise) => exercise.id !== exerciseId),
    );
  }

  function moveExercise(index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= selectedExercises.length) {
      return;
    }

    const updated = [...selectedExercises];

    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];

    setSelectedExercises(updated);
  }

  function clearWorkout() {
    setSelectedExercises([]);
    setSuccessMessage("");
  }

  function resetFilters() {
    setCategory("Alle");
    setSearch("");
  }

  async function saveWorkout() {
    if (!user) {
      setErrorMessage("Du skal være logget ind for at gemme træningen.");
      return;
    }

    if (!selectedExercises.length) {
      setErrorMessage("Tilføj mindst én øvelse til din træning.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const cleanTitle = title.trim() || "Min golf fitness";

   const { data: session, error: sessionError } = await supabase
     .from("fitness_sessions")
     .insert({
       user_id: user.id,
       title: cleanTitle,
       location,
       goal: goals[0] || "Generel golfperformance",
       goals: goals.length > 0 ? goals : ["Generel golfperformance"],
       planned_duration_minutes: plannedDuration,
       actual_duration_seconds: 0,
       paused_duration_seconds: 0,
       status: "planned",
     })
     .select("id")
     .single();

    if (sessionError || !session) {
      console.error(sessionError);

      setErrorMessage("Træningen kunne ikke gemmes. Prøv igen.");

      setSaving(false);
      return;
    }

    const sessionExercises = selectedExercises.map((exercise, index) => ({
      session_id: session.id,
      exercise_id: exercise.id,
      exercise_title: exercise.title,
      category: exercise.category,
      description: exercise.description || "",
      instructions: exercise.instructions || [],
      sets: exercise.sets || 1,
      reps: exercise.reps ?? null,
      duration_seconds: exercise.duration_seconds ?? null,
      rest_seconds: exercise.rest_seconds || 0,
      position: index,
      completed: false,
    }));

    const { error: exercisesError } = await supabase
      .from("fitness_session_exercises")
      .insert(sessionExercises);

    if (exercisesError) {
      console.error(exercisesError);

      // Fjern sessionen igen hvis øvelserne ikke kunne gemmes.
      await supabase.from("fitness_sessions").delete().eq("id", session.id);

      setErrorMessage("Træningen blev ikke gemt korrekt. Prøv igen.");

      setSaving(false);
      return;
    }

   setSaving(false);

   navigate(`/fitness-sessions/${session.id}`);
  }

  return (
    <div className="golf-fitness-page">
      <div className="golf-fitness-container">
        {/* HEADER */}
        <header className="golf-fitness-header">
          <div>
            <span className="golf-fitness-eyebrow">GOLF FITNESS</span>

            <h1>Byg din egen træning</h1>

            <p>
              Sammensæt en træning, der gør dig stærkere, mere stabil og bedre
              rustet til dit golfspil.
            </p>
          </div>

          <div className="golf-fitness-header-icon">
            <Dumbbell size={26} />
          </div>
        </header>

        {/* ERROR */}
        {errorMessage && (
          <div className="golf-fitness-message error">
            <span>{errorMessage}</span>

            <button
              type="button"
              onClick={() => setErrorMessage("")}
              aria-label="Luk besked"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* SUCCESS */}
        {successMessage && (
          <div className="golf-fitness-message success">
            <Check size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* LOCATION */}
        <section className="fitness-builder-card">
          <div className="fitness-section-heading">
            <div>
              <span className="fitness-step">01</span>
              <div>
                <h2>Hvor træner du?</h2>
                <p>Vi viser kun øvelser, der passer til stedet.</p>
              </div>
            </div>
          </div>

          <div className="fitness-location-grid">
            {LOCATION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = location === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`fitness-location-option ${
                    active ? "active" : ""
                  }`}
                  onClick={() => setLocation(option.value)}
                >
                  <div className="fitness-option-icon">
                    <Icon size={22} />
                  </div>

                  <div className="fitness-location-text">
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </div>

                  {active && (
                    <div className="fitness-selected-check">
                      <Check size={16} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* GOAL */}
        <section className="fitness-builder-card">
          <div className="fitness-section-heading">
            <div>
              <span className="fitness-step">02</span>
              <div>
                <h2>Hvad vil du forbedre?</h2>
                <p>
                  Vælg ét eller flere områder, din træning skal fokusere på.
                </p>
              </div>
            </div>
          </div>

          <div className="fitness-goal-grid">
            {GOAL_OPTIONS.map((option) => {
              const active = goals.includes(option);

              return (
                <button
                  key={option}
                  type="button"
                  className={`fitness-goal-button ${active ? "active" : ""}`}
                  onClick={() => toggleGoal(option)}
                >
                  {option}

                  {active && <Check size={16} />}
                </button>
              );
            })}
          </div>
        </section>

        {/* TIME */}
        <section className="fitness-builder-card">
          <div className="fitness-section-heading">
            <div>
              <span className="fitness-step">03</span>
              <div>
                <h2>Hvor lang tid har du?</h2>
                <p>Det er et mål – du kan stadig selv vælge øvelser.</p>
              </div>
            </div>
          </div>

          <div className="fitness-time-grid">
            {TIME_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`fitness-time-button ${
                  plannedDuration === minutes ? "active" : ""
                }`}
                onClick={() => setPlannedDuration(minutes)}
              >
                <Clock3 size={17} />
                {minutes} min
              </button>
            ))}
          </div>
        </section>

        {/* WORKOUT NAME */}
        <section className="fitness-builder-card">
          <div className="fitness-section-heading">
            <div>
              <span className="fitness-step">04</span>
              <div>
                <h2>Navngiv din træning</h2>
                <p>Du kan ændre navnet eller bare bruge standardnavnet.</p>
              </div>
            </div>
          </div>

          <input
            className="fitness-title-input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Fx Min driver power-træning"
            maxLength={80}
          />
        </section>

        {/* EXERCISE LIBRARY + CURRENT WORKOUT */}
        <section className="fitness-builder-layout">
          {/* LIBRARY */}
          <div className="fitness-library-card">
            <div className="fitness-library-header">
              <div>
                <span className="fitness-step">05</span>

                <div>
                  <h2>Vælg dine øvelser</h2>
                  <p>Tilføj præcis de øvelser, du vil have med.</p>
                </div>
              </div>

              <span className="fitness-count">
                {filteredExercises.length} øvelser
              </span>
            </div>

            {/* SEARCH */}
            <div className="fitness-search">
              <Search size={18} />

              <input
                type="text"
                placeholder="Søg efter øvelse..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Ryd søgning"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* CATEGORY FILTER */}
            <div className="fitness-category-filter">
              <Filter size={16} />

              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={category === option ? "active" : ""}
                  onClick={() => setCategory(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="fitness-loading">Henter øvelser...</div>
            ) : filteredExercises.length === 0 ? (
              <div className="fitness-empty">
                <Dumbbell size={26} />

                <h3>Ingen øvelser fundet</h3>

                <p>Prøv en anden kategori eller søgning.</p>

                <button type="button" onClick={resetFilters}>
                  Nulstil filtre
                </button>
              </div>
            ) : (
              <div className="fitness-exercise-list">
                {filteredExercises.map((exercise) => {
                  const selected = isSelected(exercise.id);

                  return (
                    <article
                      key={exercise.id}
                      className={`fitness-exercise-card ${
                        selected ? "selected" : ""
                      }`}
                    >
                      <div className="fitness-exercise-main">
                        <div className="fitness-exercise-category">
                          {exercise.category}
                        </div>

                        <h3>{exercise.title}</h3>

                        <p>{exercise.description}</p>

                        <div className="fitness-exercise-meta">
                          <span>{exercise.sets} sæt</span>

                          {exercise.reps && <span>{exercise.reps} reps</span>}

                          {exercise.duration_seconds && (
                            <span>{exercise.duration_seconds}s</span>
                          )}

                          {exercise.video_url && (
                            <span className="has-video">
                              <Video size={14} />
                              Video
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="fitness-exercise-action">
                        {selected ? (
                          <button
                            type="button"
                            className="fitness-added-button"
                            disabled
                          >
                            <Check size={17} />
                            Tilføjet
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="fitness-add-button"
                            onClick={() => addExercise(exercise)}
                          >
                            <Plus size={18} />
                            Tilføj
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* CURRENT WORKOUT */}
          <aside className="fitness-workout-card">
            <div className="fitness-workout-header">
              <div>
                <span className="fitness-workout-label">DIN TRÆNING</span>

                <h2>{title || "Min golf fitness"}</h2>
              </div>

              {selectedExercises.length > 0 && (
                <button
                  type="button"
                  className="fitness-clear-button"
                  onClick={clearWorkout}
                >
                  Ryd
                </button>
              )}
            </div>

            <div className="fitness-workout-summary">
              <div>
                <strong>{selectedExercises.length}</strong>
                <span>øvelser</span>
              </div>

              <div>
                <strong>{estimatedMinutes}</strong>
                <span>ca. min</span>
              </div>

              <div>
                <strong>{plannedDuration}</strong>
                <span>mål</span>
              </div>
            </div>

            {selectedExercises.length === 0 ? (
              <div className="fitness-workout-empty">
                <div className="fitness-workout-empty-icon">
                  <Plus size={24} />
                </div>

                <h3>Din træning er tom</h3>

                <p>
                  Tilføj øvelser fra biblioteket, så vises de her i den
                  rækkefølge, du skal træne dem.
                </p>
              </div>
            ) : (
              <div className="fitness-selected-list">
                {selectedExercises.map((exercise, index) => (
                  <div className="fitness-selected-exercise" key={exercise.id}>
                    <div className="fitness-selected-number">{index + 1}</div>

                    <div className="fitness-selected-info">
                      <strong>{exercise.title}</strong>

                      <span>
                        {exercise.sets} sæt
                        {exercise.reps ? ` · ${exercise.reps} reps` : ""}
                      </span>
                    </div>

                    <div className="fitness-selected-actions">
                      <button
                        type="button"
                        onClick={() => moveExercise(index, -1)}
                        disabled={index === 0}
                        aria-label="Flyt op"
                      >
                        <ArrowUp size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveExercise(index, 1)}
                        disabled={index === selectedExercises.length - 1}
                        aria-label="Flyt ned"
                      >
                        <ArrowDown size={16} />
                      </button>

                      <button
                        type="button"
                        className="delete"
                        onClick={() => removeExercise(exercise.id)}
                        aria-label={`Fjern ${exercise.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedExercises.length > 0 && (
              <div className="fitness-time-status">
                <div>
                  <Clock3 size={17} />

                  <span>
                    Estimeret tid: <strong>ca. {estimatedMinutes} min</strong>
                  </span>
                </div>

                {durationDifference > 5 ? (
                  <small className="over-time">
                    Din træning er længere end dit mål på {plannedDuration} min.
                  </small>
                ) : durationDifference < -5 ? (
                  <small className="under-time">
                    Du er under dit mål på {plannedDuration} min.
                  </small>
                ) : (
                  <small className="on-time">
                    Din træning passer godt til dit mål.
                  </small>
                )}
              </div>
            )}

            <button
              type="button"
              className="fitness-save-button"
              disabled={saving || selectedExercises.length === 0}
              onClick={saveWorkout}
            >
              {saving ? (
                "Gemmer..."
              ) : (
                <>
                  <Check size={19} />
                  Gem træning
                </>
              )}
            </button>
          </aside>
        </section>
      </div>
    </div>
  );
}
