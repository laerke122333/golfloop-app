import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  Dumbbell,
  LoaderCircle,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user } = useAuth();

  // =========================
  // GOLFUDSTYR
  // =========================
  const [equipment, setEquipment] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  // =========================
  // FITNESSUDSTYR
  // =========================
  const [fitnessEquipment, setFitnessEquipment] = useState([]);
  const [selectedFitnessEquipment, setSelectedFitnessEquipment] = useState([]);
  const [fitnessLoading, setFitnessLoading] = useState(true);
  const [fitnessSavingId, setFitnessSavingId] = useState(null);

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // =========================
  // STATISTIK
  // =========================
  const [sessions, setSessions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [developmentResults, setDevelopmentResults] = useState([]);
  const [selectedDevelopmentExercise, setSelectedDevelopmentExercise] =
    useState("");

  // =========================================================
  // HENT GOLFUDSTYR
  // =========================================================

  useEffect(() => {
    let active = true;

    async function loadEquipment() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const [equipmentResult, userEquipmentResult] = await Promise.all([
        supabase
          .from("training_equipment")
          .select("id,name,description")
          .eq("is_default", true)
          .order("name"),

        supabase
          .from("user_training_equipment")
          .select("equipment_id")
          .eq("user_id", user.id),
      ]);

      if (!active) return;

      if (equipmentResult.error) {
        setError(
          `Kunne ikke hente redskaber: ${equipmentResult.error.message}`,
        );
        setLoading(false);
        return;
      }

      if (userEquipmentResult.error) {
        setError(
          `Kunne ikke hente dine valgte redskaber: ${userEquipmentResult.error.message}`,
        );
        setLoading(false);
        return;
      }

      setEquipment(equipmentResult.data || []);

      setSelectedEquipment(
        (userEquipmentResult.data || []).map((item) => item.equipment_id),
      );

      setLoading(false);
    }

    loadEquipment();

    return () => {
      active = false;
    };
  }, [user?.id]);

  // =========================================================
  // HENT FITNESSUDSTYR
  // =========================================================

  useEffect(() => {
    let active = true;

    async function loadFitnessEquipment() {
      if (!user?.id) {
        setFitnessLoading(false);
        return;
      }

      setFitnessLoading(true);

      const [fitnessEquipmentResult, userFitnessEquipmentResult] =
        await Promise.all([
          supabase
            .from("fitness_equipment")
            .select("id,name,description")
            .eq("is_default", true)
            .order("name"),

          supabase
            .from("user_fitness_equipment")
            .select("equipment_id")
            .eq("user_id", user.id),
        ]);

      if (!active) return;

      if (fitnessEquipmentResult.error) {
        setError(
          `Kunne ikke hente fitnessudstyr: ${fitnessEquipmentResult.error.message}`,
        );
        setFitnessLoading(false);
        return;
      }

      if (userFitnessEquipmentResult.error) {
        setError(
          `Kunne ikke hente dit fitnessudstyr: ${userFitnessEquipmentResult.error.message}`,
        );
        setFitnessLoading(false);
        return;
      }

      setFitnessEquipment(fitnessEquipmentResult.data || []);

      setSelectedFitnessEquipment(
        (userFitnessEquipmentResult.data || []).map(
          (item) => item.equipment_id,
        ),
      );

      setFitnessLoading(false);
    }

    loadFitnessEquipment();

    return () => {
      active = false;
    };
  }, [user?.id]);

  // =========================================================
  // HENT STATISTIK
  // =========================================================

  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    async function loadStats() {
      setStatsLoading(true);

      const [sessionResult, countResult, reviewResult, developmentResult] =
        await Promise.all([
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

          supabase
            .from("training_session_exercises")
            .select(
              "id,exercise_title,category,result_score,result_total,created_at",
            )
            .not("result_score", "is", null)
            .not("result_total", "is", null)
            .order("created_at", {
              ascending: true,
            })
            .limit(100),
        ]);

      if (!active) return;

      if (sessionResult.error) {
        setError(
          `Kunne ikke hente træningsplaner: ${sessionResult.error.message}`,
        );
      }

      if (countResult.error) {
        setError(
          `Kunne ikke hente antal træningsplaner: ${countResult.error.message}`,
        );
      }

      if (reviewResult.error) {
        setError(
          `Kunne ikke hente evalueringer: ${reviewResult.error.message}`,
        );
      }

      if (developmentResult.error) {
        setError(
          `Kunne ikke hente dine træningsresultater: ${developmentResult.error.message}`,
        );
      }

      setSessions(sessionResult.data || []);
      setSessionCount(countResult.count || 0);
      setReviews(reviewResult.data || []);
      setDevelopmentResults(developmentResult.data || []);
      setStatsLoading(false);
    }

    loadStats();

    return () => {
      active = false;
    };
  }, [user?.id]);

  // =========================================================
  // GEM / FJERN GOLFUDSTYR
  // =========================================================

  async function toggleEquipment(equipmentId) {
    if (!user?.id || savingId) return;

    setSavingId(equipmentId);
    setError("");
    setNotice("");

    const isSelected = selectedEquipment.includes(equipmentId);

    try {
      if (isSelected) {
        const { error: deleteError } = await supabase
          .from("user_training_equipment")
          .delete()
          .eq("user_id", user.id)
          .eq("equipment_id", equipmentId);

        if (deleteError) {
          throw deleteError;
        }

        setSelectedEquipment((current) =>
          current.filter((id) => id !== equipmentId),
        );
      } else {
        const { error: insertError } = await supabase
          .from("user_training_equipment")
          .insert({
            user_id: user.id,
            equipment_id: equipmentId,
          });

        if (insertError) {
          throw insertError;
        }

        setSelectedEquipment((current) => [...current, equipmentId]);
      }

      setNotice("Dine træningsredskaber er gemt.");
    } catch (equipmentError) {
      setError(`Redskabet kunne ikke gemmes: ${equipmentError.message}`);
    } finally {
      setSavingId(null);
    }
  }

  // =========================================================
  // GEM / FJERN FITNESSUDSTYR
  // =========================================================

  async function toggleFitnessEquipment(equipmentId) {
    if (!user?.id || fitnessSavingId) return;

    setFitnessSavingId(equipmentId);
    setError("");
    setNotice("");

    const isSelected = selectedFitnessEquipment.includes(equipmentId);

    try {
      if (isSelected) {
        const { error: deleteError } = await supabase
          .from("user_fitness_equipment")
          .delete()
          .eq("user_id", user.id)
          .eq("equipment_id", equipmentId);

        if (deleteError) {
          throw deleteError;
        }

        setSelectedFitnessEquipment((current) =>
          current.filter((id) => id !== equipmentId),
        );
      } else {
        const { error: insertError } = await supabase
          .from("user_fitness_equipment")
          .insert({
            user_id: user.id,
            equipment_id: equipmentId,
          });

        if (insertError) {
          throw insertError;
        }

        setSelectedFitnessEquipment((current) => [...current, equipmentId]);
      }

      setNotice("Dit hjemmetræningsudstyr er gemt.");
    } catch (fitnessError) {
      setError(`Fitnessudstyret kunne ikke gemmes: ${fitnessError.message}`);
    } finally {
      setFitnessSavingId(null);
    }
  }

  // =========================================================
  // UDVIKLING
  // =========================================================

  const plannedCount = sessions.filter(
    (session) =>
      session.status === "planned" || session.status === "in_progress",
  ).length;

  const developmentExercises = [
    ...new Set(developmentResults.map((result) => result.exercise_title)),
  ];

  const selectedExercise =
    selectedDevelopmentExercise ||
    developmentExercises[developmentExercises.length - 1] ||
    "";

  const selectedResults = developmentResults.filter(
    (result) =>
      result.exercise_title === selectedExercise &&
      Number(result.result_total) > 0 &&
      Number(result.result_score) >= 0,
  );

  const graphResults = selectedResults.slice(-8);

  const normalizedScores = selectedResults.map(
    (result) =>
      (Number(result.result_score) / Number(result.result_total)) * 10,
  );

  const latestAverage =
    normalizedScores.length > 0
      ? normalizedScores.slice(-5).reduce((sum, score) => sum + score, 0) /
        Math.min(5, normalizedScores.length)
      : 0;

  const previousScores = normalizedScores.slice(
    Math.max(0, normalizedScores.length - 10),
    Math.max(0, normalizedScores.length - 5),
  );

  const previousAverage =
    previousScores.length > 0
      ? previousScores.reduce((sum, score) => sum + score, 0) /
        previousScores.length
      : null;

  const developmentChange =
    previousAverage !== null
      ? ((latestAverage - previousAverage) / previousAverage) * 100
      : null;

  const latestResult = selectedResults[selectedResults.length - 1] || null;

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="page-enter profile-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Tilbage til overblik
      </Link>

      <header className="page-header">
        <div>

          <h1>
            Din profil
            <span className="heading-dot">.</span>
          </h1>

          <p className="page-lead">
            Her kan du indstaste hvilket udstyr du har rådighed til. Golf vil kun foreslå træninger med det udstyr du har.
          </p>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {notice && (
        <div className="alert alert-success">
          <Check size={18} />
          {notice}
        </div>
      )}

     

      {/* =====================================================
          UDVIKLING
      ===================================================== */}

      <section className="development-panel">
        <div className="development-heading">
          <div>
            <div className="eyebrow">DIN UDVIKLING</div>

            <h2>Se hvordan du bliver bedre</h2>

            <p>
              GolfLoop gemmer dine resultater, så du kan følge din udvikling
              over tid.
            </p>
          </div>

          <div className="development-icon">
            <TrendingUp size={22} />
          </div>
        </div>

        {statsLoading ? (
          <div className="development-loading">Henter dine resultater…</div>
        ) : developmentExercises.length === 0 ? (
          <div className="development-empty">
            <TrendingUp size={22} />

            <div>
              <strong>Din udvikling starter her</strong>

              <p>
                Gennemfør en øvelse og gem dit resultat, så begynder GolfLoop at
                vise din udvikling.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="development-selector">
              <label htmlFor="development-exercise">Vælg øvelse</label>

              <select
                id="development-exercise"
                value={selectedExercise}
                onChange={(event) =>
                  setSelectedDevelopmentExercise(event.target.value)
                }
              >
                {developmentExercises.map((exercise) => (
                  <option key={exercise} value={exercise}>
                    {exercise}
                  </option>
                ))}
              </select>
            </div>

            <div className="development-summary">
              <div className="development-stat">
                <span>Gennemsnit</span>

                <strong>
                  {latestAverage.toFixed(1)}
                  <small>/10</small>
                </strong>
              </div>

              {latestResult && (
                <div className="development-stat">
                  <span>Seneste</span>

                  <strong>
                    {latestResult.result_score}

                    <small>/{latestResult.result_total}</small>
                  </strong>
                </div>
              )}

              {developmentChange !== null && (
                <div className="development-stat">
                  <span>Udvikling</span>

                  <strong
                    className={
                      developmentChange >= 0
                        ? "development-positive"
                        : "development-negative"
                    }
                  >
                    {developmentChange >= 0 ? "+" : ""}
                    {developmentChange.toFixed(0)}%
                  </strong>
                </div>
              )}
            </div>

            <div className="development-chart">
              <div className="chart-y-axis">
                <span>10</span>
                <span>8</span>
                <span>6</span>
                <span>4</span>
                <span>2</span>
                <span>0</span>
              </div>

              <div className="chart-area">
                <div className="chart-grid-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                {graphResults.length > 0 && (
                  <svg
                    className="development-svg"
                    viewBox="0 0 600 220"
                    preserveAspectRatio="none"
                    aria-label="Din udvikling over tid"
                  >
                    <polyline
                      points={graphResults
                        .map((result, index) => {
                          const score =
                            (Number(result.result_score) /
                              Number(result.result_total)) *
                            10;

                          const x =
                            graphResults.length === 1
                              ? 300
                              : (index / (graphResults.length - 1)) * 580 + 10;

                          const y = 210 - score * 20;

                          return `${x},${y}`;
                        })
                        .join(" ")}
                      fill="none"
                      stroke="var(--green)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {graphResults.map((result, index) => {
                      const score =
                        (Number(result.result_score) /
                          Number(result.result_total)) *
                        10;

                      const x =
                        graphResults.length === 1
                          ? 300
                          : (index / (graphResults.length - 1)) * 580 + 10;

                      const y = 210 - score * 20;

                      return (
                        <circle
                          key={result.id}
                          cx={x}
                          cy={y}
                          r="6"
                          fill="var(--green)"
                          stroke="var(--cream)"
                          strokeWidth="3"
                        />
                      );
                    })}
                  </svg>
                )}

                <div className="chart-dates">
                  {graphResults.map((result) => (
                    <span key={`${result.id}-date`}>
                      {new Date(result.created_at).toLocaleDateString("da-DK", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="development-message">
              {developmentChange !== null && developmentChange > 0 ? (
                <>
                  <span>📈</span>

                  <p>
                    <strong>Du bliver bedre!</strong> Din gennemsnitlige score
                    er steget {developmentChange.toFixed(0)}% sammenlignet med
                    dine tidligere resultater.
                  </p>
                </>
              ) : developmentChange !== null && developmentChange < 0 ? (
                <>
                  <span>💪</span>

                  <p>
                    <strong>Bliv ved!</strong> Din seneste score er lidt lavere
                    end tidligere. Mere træning kan gøre forskellen.
                  </p>
                </>
              ) : (
                <>
                  <span>🎯</span>

                  <p>
                    <strong>Fortsæt træningen.</strong> Når du får flere
                    resultater, bliver din udvikling endnu tydeligere.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {/* =====================================================
          GOLFUDSTYR
      ===================================================== */}

      <section className="profile-equipment-panel">
        <div className="profile-equipment-heading">
          
          <div>
            <span className="eyebrow">GOLFTRÆNINGSREDSKABER</span>

            <h2>Hvad har du adgang til?</h2>

            <p>Vælg de redskaber, du kan bruge når du træner.</p>
          </div>

          <span className="equipment-count">
            {selectedEquipment.length} valgt
          </span>
        </div>

        {loading ? (
          <div className="inline-loading">
            <LoaderCircle size={18} className="spin" />
            Henter redskaber…
          </div>
        ) : (
          <div className="equipment-selection-grid">
            {equipment.map((item) => {
              const selected = selectedEquipment.includes(item.id);

              const saving = savingId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`equipment-option ${
                    selected ? "equipment-option-selected" : ""
                  }`}
                  onClick={() => toggleEquipment(item.id)}
                  disabled={savingId !== null}
                >
                  <div className="equipment-option-icon">
                    {saving ? (
                      <LoaderCircle size={20} className="spin" />
                    ) : selected ? (
                      <Check size={20} />
                    ) : (
                      <Wrench size={20} />
                    )}
                  </div>

                  <div className="equipment-option-copy">
                    <strong>{item.name}</strong>

                    <span>{item.description}</span>
                  </div>

                  <div
                    className={`equipment-checkbox ${
                      selected ? "equipment-checkbox-selected" : ""
                    }`}
                  >
                    {selected && <Check size={15} />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* =====================================================
          NYT: HJEMMETRÆNING / FITNESSUDSTYR
      ===================================================== */}

      <section className="profile-equipment-panel">
        <div className="profile-equipment-heading">
          <div>
            <span className="eyebrow">HJEMMETRÆNING</span>

            <h2>Hvad har du derhjemme?</h2>

            <p>Vælg det udstyr, du har adgang til når du træner hjemme.</p>
          </div>

          <span className="equipment-count">
            {selectedFitnessEquipment.length} valgt
          </span>
        </div>

        {fitnessLoading ? (
          <div className="inline-loading">
            <LoaderCircle size={18} className="spin" />
            Henter fitnessudstyr…
          </div>
        ) : (
          <div className="equipment-selection-grid">
            {fitnessEquipment.map((item) => {
              const selected = selectedFitnessEquipment.includes(item.id);

              const saving = fitnessSavingId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`equipment-option ${
                    selected ? "equipment-option-selected" : ""
                  }`}
                  onClick={() => toggleFitnessEquipment(item.id)}
                  disabled={fitnessSavingId !== null}
                >
                  <div className="equipment-option-icon">
                    {saving ? (
                      <LoaderCircle size={20} className="spin" />
                    ) : selected ? (
                      <Check size={20} />
                    ) : (
                      <Dumbbell size={20} />
                    )}
                  </div>

                  <div className="equipment-option-copy">
                    <strong>{item.name}</strong>

                    <span>{item.description}</span>
                  </div>

                  <div
                    className={`equipment-checkbox ${
                      selected ? "equipment-checkbox-selected" : ""
                    }`}
                  >
                    {selected && <Check size={15} />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* =====================================================
          INFO
      ===================================================== */}

      <section className="profile-equipment-info">
        <strong>Sådan bruger GolfLoop dit udstyr</strong>

        <p>
          GolfLoop bruger dine valg til at tilpasse din golf træning og hjemmetræningen. Øvelser
          uden udstyr kan altid foreslås, mens øvelser med krav til bestemt
          udstyr kun foreslås, når du har det tilgængeligt.
        </p>
      </section>

    </div>
  );
}
