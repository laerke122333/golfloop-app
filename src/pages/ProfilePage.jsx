import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user } = useAuth();

  const [equipment, setEquipment] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [sessions, setSessions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [developmentResults, setDevelopmentResults] = useState([]);
  const [selectedDevelopmentExercise, setSelectedDevelopmentExercise] =
    useState("");

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

  // ⬇️ SÆT DENNE USEEFFECT IND HER
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
            .order("created_at", { ascending: false })
            .limit(4),

          supabase.from("training_sessions").select("id", {
            count: "exact",
            head: true,
          }),

          supabase
            .from("round_reviews")
            .select("id,played_at,focus_areas,notes,created_at")
            .order("played_at", { ascending: false })
            .limit(3),

          supabase
            .from("training_session_exercises")
            .select(
              "id,exercise_title,category,result_score,result_total,created_at",
            )
            .not("result_score", "is", null)
            .not("result_total", "is", null)
            .order("created_at", { ascending: true })
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

  // ⬇️ DIN EKSISTERENDE FUNKTION SKAL BLIVE HER
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
  return (
    <div className="page-enter profile-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Tilbage til overblik
      </Link>

      <header className="page-header">
        <div>
          <div className="eyebrow">DIN PROFIL</div>

          <h1>
            Dine træninger
            <span className="heading-dot">.</span>
          </h1>

          <p className="page-lead">
            Her kan du se dine træningsplaner, evalueringer og vælge de
            redskaber, du har adgang til.
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

      <section className="stats-grid" aria-label="Dine tal">
        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <CalendarDays size={20} />
          </div>

          <div className="stat-label">Træningsplaner</div>

          <div className="stat-value">{statsLoading ? "—" : sessionCount}</div>

          <div className="stat-foot">Oprettet i alt</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-sand">
            <Clock3 size={20} />
          </div>

          <div className="stat-label">Planlagt lige nu</div>

          <div className="stat-value">{statsLoading ? "—" : plannedCount}</div>

          <div className="stat-foot">Venter på dig</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <ClipboardCheck size={20} />
          </div>

          <div className="stat-label">Seneste evalueringer</div>

          <div className="stat-value">
            {statsLoading ? "—" : reviews.length}
          </div>

          <div className="stat-foot">Maks. 3 seneste vises</div>
        </div>
      </section>

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

      <section className="profile-equipment-panel">
        <div className="profile-equipment-heading">
          <div>
            <span className="eyebrow">TRÆNINGSREDSKABER</span>

            <h2>Hvad har du adgang til?</h2>

            <p>Vælg de redskaber, du kan bruge, når du træner.</p>
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

      <section className="profile-equipment-info">
        <strong>Så bruger GolfLoop dine valg</strong>

        <p>
          Øvelser uden særligt udstyr kan altid foreslås. Hvis en øvelse kræver
          et redskab, vil GolfLoop kun foreslå den, når du har valgt det på din
          profil.
        </p>
      </section>
    </div>
  );
}
