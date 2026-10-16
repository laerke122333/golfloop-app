import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Flag,
  Heart,
  LoaderCircle,
  Play,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

// UI-rækkefølgen er bevidst: Driver, Jernslag, Putts, Wedges / Short Game, Bunker.
// I databasen hedder Putting stadig "Putting" og Wedges stadig "Wedges".
const CATEGORIES = ["Driver", "Jernslag", "Putting", "Wedges", "Bunker"];
const TIME_OPTIONS = [15, 30, 45, 60, 90];

const CATEGORY_LABELS = {
  Driver: "Driver",
  Jernslag: "Jernslag",
  Putting: "Putts",
  Wedges: "Wedges / Short Game",
  Bunker: "Bunker",
};

const CATEGORY_DESCRIPTIONS = {
  Driver: "Retning og længde",
  Jernslag: "Kontakt og præcision",
  Putting: "Afstand og korte putts",
  Wedges: "Indspil og længdekontrol",
  Bunker: "Teknik og kontrol",
};

function allocateMinutes(total, count) {
  if (!count) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

export default function PlannerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // null = vælg metode, auto = GolfLoop planlægger, manual = brugeren vælger selv.
  const [mode, setMode] = useState(null);
  const [openCategory, setOpenCategory] = useState(null);

  const [minutes, setMinutes] = useState("30");
  const [areas, setAreas] = useState(["Wedges", "Putting"]);
  const [prioritizeLatest, setPrioritizeLatest] = useState(true);
  const [latestReview, setLatestReview] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trainingName, setTrainingName] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPlannerData() {
      setLoading(true);

      const [exerciseResult, reviewResult, favoriteResult] = await Promise.all([
        supabase
          .from("exercises")
          .select(
            "id,title,category,description,instructions,duration_minutes,facilities,difficulty,target,required_equipment",
          )
          .order("category")
          .order("title"),

        supabase
          .from("round_reviews")
          .select("id,played_at,focus_areas,notes")
          .order("played_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("exercise_favorites")
          .select("exercise_id")
          .eq("user_id", user.id),
      ]);

      if (!active) return;

      if (favoriteResult.error) {
        setError(
          `Favoritter kunne ikke hentes: ${favoriteResult.error.message}`,
        );
      }

      if (exerciseResult.error) {
        setError(
          `Kunne ikke hente øvelser: ${exerciseResult.error.message}. Har du kørt SQL-scriptet i Supabase?`,
        );
      }

      if (reviewResult.error) {
        setError(
          `Kunne ikke hente din seneste runde: ${reviewResult.error.message}`,
        );
      }

      setExercises(exerciseResult.data || []);
      setLatestReview(reviewResult.data || null);

      setFavoriteIds(
        new Set(
          (favoriteResult.data || []).map((favorite) => favorite.exercise_id),
        ),
      );

      console.log("FAVORITTER:", favoriteResult.data);

      console.log(
        "FAVORIT ØVELSER:",
        (exerciseResult.data || [])
          .filter((exercise) =>
            (favoriteResult.data || []).some(
              (favorite) => favorite.exercise_id === exercise.id,
            ),
          )
          .map((exercise) => `${exercise.category}: ${exercise.title}`),
      );

      setLoading(false);
    }

    if (user) loadPlannerData();

    return () => {
      active = false;
    };
  }, [user]);

  const availableAreas = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.category))],
    [exercises],
  );

  const effectiveAreas = useMemo(
    () => [
      ...new Set([
        ...areas,
        ...(prioritizeLatest && latestReview
          ? latestReview.focus_areas || []
          : []),
      ]),
    ],
    [areas, prioritizeLatest, latestReview],
  );

  const exercisesByCategory = useMemo(() => {
    return CATEGORIES.reduce((groups, category) => {
      const categoryExercises = exercises.filter(
        (exercise) => exercise.category === category,
      );

      groups[category] = [...categoryExercises].sort((a, b) => {
        const aIsFavorite = favoriteIds.has(a.id);
        const bIsFavorite = favoriteIds.has(b.id);

        if (aIsFavorite && !bIsFavorite) {
          return -1;
        }

        if (!aIsFavorite && bIsFavorite) {
          return 1;
        }

        return a.title.localeCompare(b.title, "da");
      });

      return groups;
    }, {});
  }, [exercises, favoriteIds]);

  const chosenIds = plan.map((exercise) => exercise.id);
  const totalPlannedMinutes = plan.reduce(
    (sum, exercise) => sum + Number(exercise.duration_minutes || 0),
    0,
  );

  function resetMessages() {
    setError("");
    setNotice("");
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    setPlan([]);
    setOpenCategory(null);
    resetMessages();
  }

  function toggleArea(area) {
    setAreas((current) =>
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area],
    );
    setPlan([]);
    resetMessages();
  }

  function toggleManualExercise(exercise) {
    const alreadySelected = chosenIds.includes(exercise.id);

    if (alreadySelected) {
      setPlan((current) => current.filter((item) => item.id !== exercise.id));
      resetMessages();
      return;
    }

    const next = [...plan, { ...exercise }];
    const nextTotal = next.reduce(
      (sum, item) => sum + Number(item.duration_minutes || 0),
      0,
    );

    if (nextTotal > 240) {
      setError("Din selvvalgte træning må højst være 240 minutter.");
      return;
    }

    setPlan(next);
    resetMessages();
  }

  function generatePlan() {
    resetMessages();
    setPlan([]);

    const duration = Number(minutes);

    if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
      setError("Vælg en træning på mellem 5 og 240 minutter.");
      return;
    }

    if (!effectiveAreas.length) {
      setError("Vælg mindst ét område, du vil træne.");
      return;
    }

    if (duration < effectiveAreas.length * 5) {
      setError(
        `Du har valgt ${effectiveAreas.length} fokusområder. Vælg mindst ${effectiveAreas.length * 5} minutter, så der er tid til hvert område.`,
      );
      return;
    }

    const groups = effectiveAreas.map((category) => ({
      category,
      items: exercises.filter((exercise) => exercise.category === category),
      cursor: 0,
    }));

    const missing = groups
      .filter((group) => group.items.length === 0)
      .map((group) => group.category);

    if (missing.length) {
      setError(`Der er ikke øvelser til ${missing.join(", ")}.`);
      return;
    }

    const desiredCount = Math.min(
      8,
      Math.max(groups.length, Math.floor(duration / 10)),
    );

    const selected = [];

    // Giv hvert valgt fokusområde mindst én øvelse.
    groups.forEach((group) => {
      selected.push(group.items[group.cursor]);
      group.cursor += 1;
    });

    // Fyld derefter op med flere øvelser på tværs af fokusområderne.
    let safety = 0;

    while (selected.length < desiredCount && safety < 100) {
      let added = false;

      for (const group of groups) {
        if (selected.length >= desiredCount) break;

        const next = group.items[group.cursor];

        if (next && !selected.some((exercise) => exercise.id === next.id)) {
          selected.push(next);
          group.cursor += 1;
          added = true;
        }
      }

      if (!added) break;
      safety += 1;
    }

    const durations = allocateMinutes(duration, selected.length);

    setPlan(
      selected.map((exercise, index) => ({
        ...exercise,
        duration_minutes: durations[index],
        planned_order: index,
      })),
    );

    setNotice(
      "Din træning er sammensat. Du kan stadig fjerne øvelser, før du starter.",
    );
  }

  function removeExercise(exerciseId) {
    const next = plan.filter((exercise) => exercise.id !== exerciseId);

    if (!next.length) {
      setPlan([]);
      resetMessages();
      return;
    }

    if (mode === "auto") {
      const durations = allocateMinutes(Number(minutes), next.length);
      setPlan(
        next.map((exercise, index) => ({
          ...exercise,
          duration_minutes: durations[index],
          planned_order: index,
        })),
      );
    } else {
      setPlan(next);
    }

    resetMessages();
  }

  async function savePlan(startNow = false) {
    resetMessages();

    if (!plan.length) {
      setError(
        mode === "manual"
          ? "Vælg mindst én øvelse, før du starter træningen."
          : "Sammensæt en træningsplan først.",
      );
      return;
    }

    const sessionMinutes =
      mode === "manual" ? totalPlannedMinutes : Number(minutes);

    if (
      !Number.isInteger(sessionMinutes) ||
      sessionMinutes < 5 ||
      sessionMinutes > 240
    ) {
      setError("Din træning skal være mellem 5 og 240 minutter.");
      return;
    }

    if (mode === "auto" && totalPlannedMinutes !== Number(minutes)) {
      setError(
        "Tidsfordelingen passer ikke helt. Klik på “Sammensæt min træning” igen.",
      );
      return;
    }

    setSaving(true);

    const dateLabel = new Intl.DateTimeFormat("da-DK", {
      day: "numeric",
      month: "short",
    }).format(new Date());

    const manualFocusAreas = [
      ...new Set(plan.map((exercise) => exercise.category)),
    ];

    const sessionFocusAreas =
      mode === "manual" ? manualFocusAreas : effectiveAreas;

    const { data: session, error: sessionError } = await supabase
      .from("training_sessions")
      .insert({
        user_id: user.id,
        title: trainingName.trim() || "Min træning",
        duration_minutes: sessionMinutes,
        focus_areas: sessionFocusAreas,
        // Alle faciliteter antages tilgængelige i GolfLoop.
        facility: "Flere faciliteter",
        prioritize_recent_round:
          mode === "auto" && Boolean(prioritizeLatest && latestReview),
        status: startNow ? "in_progress" : "planned",
      })
      .select()
      .single();

    if (sessionError || !session) {
      setError(sessionError?.message || "Træningen kunne ikke gemmes.");
      setSaving(false);
      return;
    }

    const rows = plan.map((exercise, index) => ({
      session_id: session.id,
      exercise_id: exercise.id,
      exercise_title: exercise.title,
      category: exercise.category,
      description: exercise.description,
      instructions: exercise.instructions || [],
      duration_minutes: Number(exercise.duration_minutes),
      position: index,
      completed: false,
    }));

    const { error: exercisesError } = await supabase
      .from("training_session_exercises")
      .insert(rows);

    if (exercisesError) {
      await supabase.from("training_sessions").delete().eq("id", session.id);

      setError(
        `Planen blev oprettet, men øvelserne kunne ikke gemmes: ${exercisesError.message}`,
      );
      setSaving(false);
      return;
    }

    navigate(startNow ? `/sessions/${session.id}` : "/");
  }

  // Første skærm: brugeren vælger, hvem der planlægger træningen.
  if (!mode) {
    return (
      <div className="page-enter planner-page">
        <div className="page-header">
          <div>
            <div className="eyebrow">DIN TRÆNING</div>
            <h1>
              Hvordan vil du træne<span className="heading-dot">.</span>
            </h1>
            <p className="page-lead">
              Vælg om GolfLoop skal sammensætte træningen for dig, eller om du
              selv vil vælge dine øvelser.
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="training-choice-grid">
          <button
            type="button"
            className="training-choice-card"
            onClick={() => chooseMode("auto")}
          >
            <div className="training-choice-icon">
              <Sparkles size={24} />
            </div>
            <div>
              <span className="eyebrow">AUTOMATISK</span>
              <h2>GolfLoop planlægger for mig</h2>
              <p>
                Vælg tid og fokusområder, så sammensætter GolfLoop en konkret
                træning.
              </p>
            </div>
            <ArrowRight size={20} />
          </button>

          <button
            type="button"
            className="training-choice-card"
            onClick={() => chooseMode("manual")}
          >
            <div className="training-choice-icon">
              <Check size={24} />
            </div>
            <div>
              <span className="eyebrow">SELVVALGT</span>
              <h2>Jeg planlægger selv</h2>
              <p>
                Vælg selv øvelser fra Driver, jernslag, putts, wedges / short
                game og bunker.
              </p>
            </div>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  // Manuel træning: kategorier kan åbnes, og konkrete øvelser kan vælges.
  if (mode === "manual") {
    return (
      <div className="page-enter planner-page">
        <div className="page-header">
          <div>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => chooseMode(null)}
            >
              <ArrowLeft size={16} />
              Tilbage
            </button>
            <div className="eyebrow">SELVVALGT TRÆNING</div>
            <h1>
              Vælg dine øvelser<span className="heading-dot">.</span>
            </h1>
            <p className="page-lead">
              Vælg de øvelser, du selv vil have med. Du kan vælge på tværs af
              alle fem kategorier.
            </p>
          </div>
          <div className="page-header-icon">
            <Check size={24} />
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="inline-loading">
            <span className="spinner" /> Henter øvelser fra dit bibliotek…
          </div>
        )}

        <div className="manual-training-layout">
          <div className="manual-category-list">
            {CATEGORIES.map((category) => {
              const categoryExercises = exercisesByCategory[category] || [];
              const selectedCount = categoryExercises.filter((exercise) =>
                chosenIds.includes(exercise.id),
              ).length;
              const isOpen = openCategory === category;

              return (
                <section
                  className={`manual-category ${
                    isOpen ? "manual-category-open" : ""
                  }`}
                  key={category}
                >
                  <button
                    type="button"
                    className="manual-category-header"
                    onClick={() => setOpenCategory(isOpen ? null : category)}
                  >
                    <div>
                      <strong>{CATEGORY_LABELS[category]}</strong>
                      <span>{CATEGORY_DESCRIPTIONS[category]}</span>
                    </div>
                    <div className="manual-category-meta">
                      {selectedCount > 0 && (
                        <span className="manual-selected-count">
                          {selectedCount} valgt
                        </span>
                      )}
                      <ChevronDown
                        size={20}
                        className={isOpen ? "rotate-180" : ""}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="manual-exercise-list">
                      {!categoryExercises.length && !loading && (
                        <p className="muted">
                          Der er ingen øvelser i denne kategori endnu.
                        </p>
                      )}

                      {categoryExercises.map((exercise) => {
                        const selected = chosenIds.includes(exercise.id);

                        return (
                          <button
                            type="button"
                            key={exercise.id}
                            className={`manual-exercise ${
                              selected ? "manual-exercise-selected" : ""
                            }`}
                            onClick={() => toggleManualExercise(exercise)}
                            aria-pressed={selected}
                          >
                            <span className="manual-exercise-copy">
                              <span className="manual-exercise-title-row">
                                <strong>{exercise.title}</strong>

                                {favoriteIds.has(exercise.id) && (
                                  <span className="manual-exercise-favorite">
                                    <Heart size={14} fill="currentColor" />
                                    Favorit
                                  </span>
                                )}
                              </span>

                              <small>
                                {exercise.duration_minutes} min. ·{" "}
                                {exercise.target ||
                                  exercise.description ||
                                  "Se øvelsesbeskrivelsen"}
                              </small>

                              <span className="planner-exercise-equipment">
                                <span className="planner-equipment-label">
                                  Udstyr
                                </span>

                                {exercise.required_equipment?.length ? (
                                  <span className="planner-equipment-list">
                                    {exercise.required_equipment.map(
                                      (equipment) => (
                                        <span
                                          className="planner-equipment-tag"
                                          key={equipment}
                                        >
                                          {equipment}
                                        </span>
                                      ),
                                    )}
                                  </span>
                                ) : (
                                  <span className="planner-equipment-none">
                                    Ingen ekstra udstyr
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <aside className="plan-preview-panel">
            <div className="plan-preview-top">
              <div className="eyebrow">DIN TRÆNING</div>
              <div className="plan-preview-icon">
                <Check size={21} />
              </div>
              <h2>
                {plan.length ? "Dine valgte øvelser" : "Vælg dine øvelser"}
              </h2>
              <p>
                {plan.length
                  ? "Du kan ændre dit valg, før du starter."
                  : "Åbn en kategori og vælg de øvelser, du vil træne."}
              </p>
            </div>

            <div className="plan-total">
              <div>
                <span>Samlet tid</span>
                <strong>
                  {totalPlannedMinutes} <small>min.</small>
                </strong>
              </div>
              <div className="plan-total-time">
                <Clock3 size={17} />
                <span>
                  {plan.length} {plan.length === 1 ? "øvelse" : "øvelser"}
                </span>
              </div>
            </div>

            {plan.length ? (
              <div className="planned-exercises">
                {plan.map((exercise, index) => (
                  <div
                    className="planned-exercise"
                    key={`${exercise.id}-${index}`}
                  >
                    <div className="planned-exercise-index">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="planned-exercise-copy">
                      <span className="planned-category">
                        {CATEGORY_LABELS[exercise.category]}
                      </span>
                      <strong>{exercise.title}</strong>
                      <small>
                        {exercise.duration_minutes} min. ·{" "}
                        {exercise.target || "Se øvelsesbeskrivelsen"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      aria-label={`Fjern ${exercise.title}`}
                      onClick={() => removeExercise(exercise.id)}
                      title="Fjern øvelse"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="plan-empty-state">
                <div className="plan-empty-illustration">
                  <Check size={35} strokeWidth={1.3} />
                </div>
                <strong>Ingen øvelser valgt endnu</strong>
                <p>Vælg øvelser fra en eller flere kategorier.</p>
              </div>
            )}

            <div className="training-name-field">
              <label htmlFor="training-name">Navngiv din træning</label>

              <input
                id="training-name"
                type="text"
                value={trainingName}
                onChange={(event) => setTrainingName(event.target.value)}
                placeholder="Fx Wedges før turnering"
                maxLength={60}
              />
            </div>

            <div className="plan-preview-footer">
              <button
                className="button button-primary button-large panel-full-button"
                disabled={!plan.length || saving}
                onClick={() => savePlan(true)}
              >
                {saving ? (
                  <>
                    <LoaderCircle size={18} className="spin" />
                    Gemmer…
                  </>
                ) : (
                  <>
                    <Play size={17} />
                    Start træningen
                    <ArrowRight size={17} />
                  </>
                )}
              </button>

              <button
                className="button button-outline panel-full-button"
                disabled={!plan.length || saving}
                onClick={() => savePlan(false)}
              >
                {saving ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Save size={17} />
                )}
                Gem til senere
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // Automatisk træning: den eksisterende GolfLoop-planlægger.
  return (
    <div className="page-enter planner-page">
      <div className="page-header">
        <div>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => chooseMode(null)}
          >
            <ArrowLeft size={16} />
            Tilbage
          </button>
          <div className="eyebrow">AUTOMATISK PLAN</div>
          <h1>
            Planlæg træning<span className="heading-dot">.</span>
          </h1>
          <p className="page-lead">
            Fortæl, hvor lang tid du har, og hvad du vil træne. Så sammensætter
            GolfLoop en plan til dig.
          </p>
        </div>
        <div className="page-header-icon">
          <Sparkles size={24} />
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} /> <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="inline-loading">
          <span className="spinner" /> Henter øvelser fra dit bibliotek…
        </div>
      )}

      <div className="planner-layout">
        <div className="planner-controls">
          <section className="form-panel">
            <div className="form-step">
              <span>01</span>
              <div>
                <h2>Hvor lang tid har du?</h2>
                <p>Vælg den tid, du realistisk kan bruge.</p>
              </div>
            </div>

            <div className="time-options">
              {TIME_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMinutes(String(value));
                    setPlan([]);
                    resetMessages();
                  }}
                  className={`time-option ${
                    String(value) === minutes ? "time-option-active" : ""
                  }`}
                >
                  <strong>{value}</strong>
                  <span>min.</span>
                </button>
              ))}

              <label
                className={`time-option time-option-custom ${
                  !TIME_OPTIONS.includes(Number(minutes))
                    ? "time-option-active"
                    : ""
                }`}
              >
                <input
                  type="number"
                  min="5"
                  max="240"
                  value={!TIME_OPTIONS.includes(Number(minutes)) ? minutes : ""}
                  placeholder="Andet"
                  onChange={(event) => {
                    setMinutes(event.target.value);
                    setPlan([]);
                    resetMessages();
                  }}
                  aria-label="Eget antal minutter"
                />
                <span>min.</span>
              </label>
            </div>
          </section>

          <section className="form-panel">
            <div className="form-step">
              <span>02</span>
              <div>
                <h2>Hvad vil du træne?</h2>
                <p>Vælg flere områder, hvis du ønsker det.</p>
              </div>
            </div>

            <div className="area-grid">
              {CATEGORIES.filter((category) =>
                availableAreas.includes(category),
              ).map((category) => {
                const checked = areas.includes(category);

                return (
                  <button
                    key={category}
                    type="button"
                    className={`area-option ${
                      checked ? "area-option-active" : ""
                    }`}
                    onClick={() => toggleArea(category)}
                    aria-pressed={checked}
                  >
                    <span
                      className={`area-option-mark ${
                        checked ? "" : "area-option-mark-empty"
                      }`}
                    >
                      {checked && <Check size={15} />}
                    </span>
                    <span className="area-option-copy">
                      <strong>{CATEGORY_LABELS[category]}</strong>
                      <small>{CATEGORY_DESCRIPTIONS[category]}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {latestReview && (
            <section className="round-focus-card">
              <div className="round-focus-icon">
                <Flag size={20} />
              </div>
              <div className="round-focus-content">
                <strong>Brug mit fokus fra seneste runde</strong>
                <p>
                  Tilføj dine fokusområder fra din seneste runde til
                  træningsplanen.
                </p>
                <div className="tag-list">
                  {(latestReview.focus_areas || []).map((area) => (
                    <span className="tag tag-green" key={area}>
                      {CATEGORY_LABELS[area] || area}
                    </span>
                  ))}
                </div>
              </div>
              <label
                className="switch"
                aria-label="Brug fokusområder fra seneste runde"
              >
                <input
                  type="checkbox"
                  checked={prioritizeLatest}
                  onChange={(event) => {
                    setPrioritizeLatest(event.target.checked);
                    setPlan([]);
                    resetMessages();
                  }}
                />
                <span className="switch-slider" />
              </label>
            </section>
          )}

          <button
            className="button button-primary button-large generate-button"
            type="button"
            disabled={loading}
            onClick={generatePlan}
          >
            <Sparkles size={18} />
            Sammensæt min træning
            <ArrowRight size={18} />
          </button>
        </div>

        <aside className="plan-preview-panel">
          <div className="plan-preview-top">
            <div className="eyebrow">DIN TRÆNINGSPLAN</div>
            <div className="plan-preview-icon">
              <Sparkles size={21} />
            </div>
            <h2>{plan.length ? "Klar til træning" : "Din næste træning"}</h2>
            <p>
              {plan.length
                ? "Justér øvelserne, og gem planen, når den passer dig."
                : "Dine valgte øvelser vises her, når du har sammensat planen."}
            </p>
          </div>

          <div className="plan-total">
            <div>
              <span>Samlet tid</span>
              <strong>
                {plan.length ? totalPlannedMinutes : Number(minutes) || 0}{" "}
                <small>min.</small>
              </strong>
            </div>
            <div className="plan-total-time">
              <Clock3 size={17} />
              <span>
                {plan.length} {plan.length === 1 ? "øvelse" : "øvelser"}
              </span>
            </div>
          </div>

          {plan.length ? (
            <div className="planned-exercises">
              {plan.map((exercise, index) => (
                <div
                  className="planned-exercise"
                  key={`${exercise.id}-${index}`}
                >
                  <div className="planned-exercise-index">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="planned-exercise-copy">
                    <span className="planned-category">
                      {CATEGORY_LABELS[exercise.category]}
                    </span>
                    <strong>{exercise.title}</strong>
                    <small>
                      {exercise.duration_minutes} min. ·{" "}
                      {exercise.target || "Se øvelsesbeskrivelsen"}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={`Fjern ${exercise.title}`}
                    onClick={() => removeExercise(exercise.id)}
                    title="Fjern øvelse"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="plan-empty-state">
              <div className="plan-empty-illustration">
                <Sparkles size={35} strokeWidth={1.3} />
              </div>
              <strong>Din træning, på din måde</strong>
              <p>
                Vælg tid og fokus til venstre. GolfLoop fordeler minutterne
                mellem konkrete øvelser.
              </p>
            </div>
          )}

          {notice && (
            <div className="alert alert-success plan-notice">
              <Check size={16} />
              <span>{notice}</span>
            </div>
          )}

          <div className="plan-preview-footer">
            <p>
              <Flag size={15} /> Vælg, om du vil træne nu eller gemme planen til
              senere.
            </p>

            <div className="training-name-field">
              <label htmlFor="training-name">
                Navngiv din træning <span>(valgfrit)</span>
              </label>

              <input
                id="training-name"
                type="text"
                value={trainingName}
                onChange={(event) => setTrainingName(event.target.value)}
                placeholder="Fx Wedges før turnering"
                maxLength={60}
              />
            </div>

            <button
              className="button button-primary button-large panel-full-button"
              disabled={!plan.length || saving}
              onClick={() => savePlan(true)}
            >
              {saving ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  Gemmer…
                </>
              ) : (
                <>
                  <Play size={17} />
                  Start træningen nu
                  <ArrowRight size={17} />
                </>
              )}
            </button>

            <button
              type="button"
              className="button button-outline"
              onClick={() => savePlan(false)}
              disabled={saving}
            >
              <Save size={17} /> Gem til senere
            </button>
          </div>
        </aside>
      </div>

      <div className="planner-footnote">
        <span className="footnote-mark">i</span>
        <p>
          Planen fordeler den samlede tid på de valgte øvelser. Brug den som en
          fleksibel guide, og tilpas længde og antal bolde efter dit niveau.
        </p>
      </div>
    </div>
  );
}
