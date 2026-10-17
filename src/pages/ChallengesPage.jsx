import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Flame,
  RotateCcw,
  Shuffle,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const CHALLENGE_TYPES = [
  "precision",
  "streak",
  "personal_best",
  "lucky",
  "timed",
  "skill",
];

const TYPE_INFO = {
  precision: {
    label: "Præcision",
    icon: Target,
    description: "Hvor mange kan du ramme?",
  },
  streak: {
    label: "Streak",
    icon: Flame,
    description: "Hvor længe kan du holde den kørende?",
  },
  personal_best: {
    label: "Personlig rekord",
    icon: Trophy,
    description: "Kan du slå din egen rekord?",
  },
  lucky: {
    label: "Lucky Seven",
    icon: Sparkles,
    description: "7 forsøg. Gør dem tælle.",
  },
  timed: {
    label: "Mod uret",
    icon: Clock3,
    description: "Hvor mange gode bolde kan du nå?",
  },
  skill: {
    label: "Skill Challenge",
    icon: Trophy,
    description: "Test en bestemt færdighed.",
  },
};

const CATEGORY_ORDER = ["Putting", "Wedges", "Jernslag", "Driver", "Bunker"];

function hashString(value) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getDateKey() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function getCategoryPriority(latestReview, exercises) {
  const reviewCategories = latestReview?.focus_areas || [];

  const normalizedReviewCategories = reviewCategories
    .map((area) => String(area).trim())
    .filter(Boolean);

  const availableCategories = [
    ...new Set(exercises.map((exercise) => exercise.category)),
  ];

  const ordered = [
    ...normalizedReviewCategories,
    ...CATEGORY_ORDER,
    ...availableCategories,
  ];

  return [...new Set(ordered)].filter((category) =>
    availableCategories.includes(category),
  );
}

function pickExercise(exercises, preferredCategories, seed = Math.random()) {
  if (!exercises.length) return null;

  for (const category of preferredCategories) {
    const matching = exercises.filter(
      (exercise) => exercise.category === category,
    );

    if (matching.length) {
      const index = Math.floor(seed * matching.length);
      return matching[index];
    }
  }

  return exercises[Math.floor(seed * exercises.length)];
}

function buildChallenge({ type, exercise, previousBest = 0, key }) {
  if (!exercise) return null;

  switch (type) {
    case "precision":
      return {
        key,
        type,
        label: "Præcision",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title: `Ram ${Math.min(8, 8)} af 10`,
        description: `Test din præcision i ${exercise.title}.`,
        instruction:
          "Giv dig selv 10 forsøg. Registrér om hver bold er god eller misset.",
        attempts: 10,
        target: 8,
        mode: "attempts",
      };

    case "streak":
      return {
        key,
        type,
        label: "Streak",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title: "Lav en streak på 5",
        description: `Hvor mange gode bolde kan du lave i træk i ${exercise.title}?`,
        instruction: "Du har 10 forsøg. Målet er mindst 5 gode bolde i træk.",
        attempts: 10,
        target: 5,
        mode: "streak",
      };

    case "personal_best": {
      const target = previousBest > 0 ? previousBest + 1 : 7;

      return {
        key,
        type,
        label: "Personlig rekord",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title:
          previousBest > 0
            ? `Slå din rekord på ${previousBest}`
            : "Sæt din første rekord",
        description: `Se hvor langt du kan nå i ${exercise.title}.`,
        instruction:
          previousBest > 0
            ? `Din bedste score er ${previousBest}. Prøv at slå den.`
            : "Du har endnu ingen registreret rekord. Sæt dit første mål.",
        attempts: 10,
        target,
        mode: "attempts",
      };
    }

    case "lucky":
      return {
        key,
        type,
        label: "Lucky Seven",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title: "Lucky Seven",
        description: "Du får kun 7 forsøg. Gør dem tælle.",
        instruction: "Ram mindst 5 ud af 7.",
        attempts: 7,
        target: 5,
        mode: "attempts",
      };

    case "timed":
      return {
        key,
        type,
        label: "Mod uret",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title: "5 minutter. Hvor mange gode bolde?",
        description: `Træn ${exercise.title} mod uret.`,
        instruction:
          "Start timeren og registrér hver god bold. Prøv at slå 20.",
        attempts: null,
        target: 20,
        mode: "timed",
        durationSeconds: 300,
      };

    case "skill":
    default:
      return {
        key,
        type: "skill",
        label: "Skill Challenge",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title: "6 gode ud af 8",
        description: `Test din teknik med ${exercise.title}.`,
        instruction: "Du har 8 forsøg. Målet er mindst 6 gode bolde.",
        attempts: 8,
        target: 6,
        mode: "attempts",
      };
  }
}

export default function ChallengesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exercises, setExercises] = useState([]);
  const [latestReview, setLatestReview] = useState(null);
  const [completions, setCompletions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeChallenge, setActiveChallenge] = useState(null);
  const [challengeSource, setChallengeSource] = useState(null);

  const [attempts, setAttempts] = useState([]);
  const [timedScore, setTimedScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const [surpriseSeed, setSurpriseSeed] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    async function loadData() {
      setLoading(true);
      setError("");

      const [exerciseResult, reviewResult, completionResult] =
        await Promise.all([
          supabase
            .from("exercises")
            .select(
              "id,title,category,description,duration_minutes,target,difficulty,facilities",
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
            .from("challenge_completions")
            .select(
              "id,challenge_key,challenge_type,challenge_title,category,exercise_id,score,target_score,total_attempts,duration_seconds,success,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

      if (!active) return;

      if (exerciseResult.error) {
        setError(`Kunne ikke hente øvelser: ${exerciseResult.error.message}`);
      }

      if (reviewResult.error) {
        setError(
          `Kunne ikke hente seneste evaluering: ${reviewResult.error.message}`,
        );
      }

      if (completionResult.error) {
        setError(
          `Kunne ikke hente dine challenges: ${completionResult.error.message}`,
        );
      }

      setExercises(exerciseResult.data || []);
      setLatestReview(reviewResult.data || null);
      setCompletions(completionResult.data || []);
      setLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const preferredCategories = useMemo(
    () => getCategoryPriority(latestReview, exercises),
    [latestReview, exercises],
  );

  const recentChallengeKeys = useMemo(
    () => new Set(completions.slice(0, 15).map((item) => item.challenge_key)),
    [completions],
  );

  const personalBest = useMemo(() => {
    const relevantScores = completions
      .filter(
        (completion) =>
          completion.challenge_type === "personal_best" &&
          completion.exercise_id,
      )
      .map((completion) => completion.score || 0);

    return relevantScores.length ? Math.max(...relevantScores) : 0;
  }, [completions]);

  const dailyChallenge = useMemo(() => {
    if (!user?.id || !exercises.length) return null;

    const dateKey = getDateKey();
    const seed = hashString(`${user.id}-${dateKey}`);

    const types = [...CHALLENGE_TYPES];
    const type = types[seed % types.length];

    const exercise = pickExercise(
      exercises,
      preferredCategories,
      (seed % 1000) / 1000,
    );

    return buildChallenge({
      type,
      exercise,
      previousBest: personalBest,
      key: `daily-${dateKey}-${type}-${exercise?.id || "none"}`,
    });
  }, [user?.id, exercises, preferredCategories, personalBest]);

  const challengeOptions = useMemo(() => {
    if (!exercises.length) return [];

    const types = ["precision", "streak", "personal_best", "lucky", "skill"];

    return types
      .map((type, index) => {
        const exercise = pickExercise(
          exercises,
          preferredCategories,
          (((index + surpriseSeed + 1) * 37) % 100) / 100,
        );

        return buildChallenge({
          type,
          exercise,
          previousBest: personalBest,
          key: `option-${type}-${exercise?.id || "none"}-${surpriseSeed}`,
        });
      })
      .filter(Boolean);
  }, [exercises, preferredCategories, personalBest, surpriseSeed]);

  useEffect(() => {
    if (!activeChallenge || activeChallenge.mode !== "timed" || timeLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          finishTimedChallenge();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeChallenge, timeLeft]);

  async function startChallenge(challenge, source = "manual") {
    if (!challenge) return;

    setResult(null);
    setChallengeSource(source);
    setActiveChallenge(challenge);
    setAttempts([]);
    setTimedScore(0);
    setSaving(false);

    if (challenge.mode === "timed") {
      setTimeLeft(challenge.durationSeconds);
    } else {
      setTimeLeft(0);
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function registerAttempt(success) {
    if (!activeChallenge || saving) return;

    const nextAttempts = [...attempts, success];
    setAttempts(nextAttempts);

    if (nextAttempts.length >= activeChallenge.attempts) {
      finishAttemptChallenge(nextAttempts);
    }
  }

  function getBestStreak(values) {
    let current = 0;
    let best = 0;

    values.forEach((value) => {
      if (value) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    });

    return best;
  }

  async function finishAttemptChallenge(finalAttempts) {
    if (!activeChallenge || saving) return;

    const score = finalAttempts.filter(Boolean).length;
    const bestStreak = getBestStreak(finalAttempts);

    let success = score >= activeChallenge.target;

    if (activeChallenge.type === "streak") {
      success = bestStreak >= activeChallenge.target;
    }

    setSaving(true);

    const { error: insertError } = await supabase
      .from("challenge_completions")
      .insert({
        user_id: user.id,
        challenge_key: activeChallenge.key,
        challenge_type: activeChallenge.type,
        challenge_title: activeChallenge.title,
        category: activeChallenge.category,
        exercise_id: activeChallenge.exerciseId,
        score: activeChallenge.type === "streak" ? bestStreak : score,
        target_score: activeChallenge.target,
        total_attempts: finalAttempts.length,
        duration_seconds: null,
        success,
      });

    if (insertError) {
      setError(`Resultatet kunne ikke gemmes: ${insertError.message}`);
      setSaving(false);
      return;
    }

    setResult({
      score: activeChallenge.type === "streak" ? bestStreak : score,
      target: activeChallenge.target,
      attempts: finalAttempts.length,
      success,
      type: activeChallenge.type,
    });

    setCompletions((current) => [
      {
        id: `local-${Date.now()}`,
        challenge_key: activeChallenge.key,
        challenge_type: activeChallenge.type,
        challenge_title: activeChallenge.title,
        category: activeChallenge.category,
        exercise_id: activeChallenge.exerciseId,
        score: activeChallenge.type === "streak" ? bestStreak : score,
        target_score: activeChallenge.target,
        total_attempts: finalAttempts.length,
        duration_seconds: null,
        success,
        created_at: new Date().toISOString(),
      },
      ...current,
    ]);

    setSaving(false);
  }

  async function finishTimedChallenge() {
    if (!activeChallenge || saving) return;

    const score = timedScore;
    const success = score >= activeChallenge.target;

    setSaving(true);

    const { error: insertError } = await supabase
      .from("challenge_completions")
      .insert({
        user_id: user.id,
        challenge_key: activeChallenge.key,
        challenge_type: activeChallenge.type,
        challenge_title: activeChallenge.title,
        category: activeChallenge.category,
        exercise_id: activeChallenge.exerciseId,
        score,
        target_score: activeChallenge.target,
        total_attempts: null,
        duration_seconds: activeChallenge.durationSeconds,
        success,
      });

    if (insertError) {
      setError(`Resultatet kunne ikke gemmes: ${insertError.message}`);
      setSaving(false);
      return;
    }

    setResult({
      score,
      target: activeChallenge.target,
      attempts: null,
      success,
      type: activeChallenge.type,
    });

    setCompletions((current) => [
      {
        id: `local-${Date.now()}`,
        challenge_key: activeChallenge.key,
        challenge_type: activeChallenge.type,
        challenge_title: activeChallenge.title,
        category: activeChallenge.category,
        exercise_id: activeChallenge.exerciseId,
        score,
        target_score: activeChallenge.target,
        total_attempts: null,
        duration_seconds: activeChallenge.durationSeconds,
        success,
        created_at: new Date().toISOString(),
      },
      ...current,
    ]);

    setSaving(false);
  }

  function addTimedSuccess() {
    if (!activeChallenge || timeLeft <= 0 || saving) return;

    setTimedScore((current) => current + 1);
  }

  function leaveChallenge() {
    setActiveChallenge(null);
    setResult(null);
    setAttempts([]);
    setTimedScore(0);
    setTimeLeft(0);
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  const completedCount = completions.length;

  const successCount = completions.filter(
    (completion) => completion.success,
  ).length;

  const successRate =
    completedCount > 0 ? Math.round((successCount / completedCount) * 100) : 0;

  if (loading) {
    return (
      <div className="page-enter challenges-page">
        <div className="challenge-loading">Henter dine challenges...</div>
      </div>
    );
  }

  if (activeChallenge) {
    return (
      <div className="page-enter challenges-page">
        <header className="challenge-header">
          <button
            type="button"
            className="challenge-back"
            onClick={leaveChallenge}
            aria-label="Tilbage"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <span className="challenge-eyebrow">{activeChallenge.label}</span>
            <h1>{activeChallenge.title}</h1>
          </div>
        </header>

        <main className="challenge-active">
          <div className="challenge-active-card">
            <span className="challenge-category">
              {activeChallenge.category}
            </span>

            <h2>{activeChallenge.exerciseTitle}</h2>

            <p>{activeChallenge.instruction}</p>

            {activeChallenge.mode === "timed" ? (
              <>
                <div className="challenge-timer">{formatTime(timeLeft)}</div>

                <div className="challenge-live-score">
                  <strong>{timedScore}</strong>
                  <span>gode bolde</span>
                </div>

                <button
                  type="button"
                  className="challenge-primary-button challenge-big-button"
                  onClick={addTimedSuccess}
                  disabled={timeLeft <= 0 || saving}
                >
                  <Check size={22} />
                  God bold
                </button>

                {timeLeft === 0 && !result && (
                  <button
                    type="button"
                    className="challenge-secondary-button"
                    onClick={() => finishTimedChallenge()}
                    disabled={saving}
                  >
                    Afslut challenge
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="challenge-score">
                  <strong>
                    {activeChallenge.type === "streak"
                      ? getBestStreak(attempts)
                      : attempts.filter(Boolean).length}
                  </strong>

                  <span>/ {activeChallenge.target}</span>
                </div>

                <div className="challenge-attempts">
                  {Array.from(
                    { length: activeChallenge.attempts },
                    (_, index) => {
                      const value = attempts[index];

                      return (
                        <div
                          key={index}
                          className={`challenge-dot ${
                            value === true
                              ? "is-success"
                              : value === false
                                ? "is-miss"
                                : ""
                          }`}
                        >
                          {value === true && <Check size={14} />}
                          {value === false && <X size={14} />}
                        </div>
                      );
                    },
                  )}
                </div>

                {!result && (
                  <div className="challenge-action-buttons">
                    <button
                      type="button"
                      className="challenge-success-button"
                      onClick={() => registerAttempt(true)}
                      disabled={saving}
                    >
                      <Check size={21} />
                      Ramte
                    </button>

                    <button
                      type="button"
                      className="challenge-miss-button"
                      onClick={() => registerAttempt(false)}
                      disabled={saving}
                    >
                      <X size={21} />
                      Missede
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {result && (
            <div
              className={`challenge-result ${
                result.success ? "is-success" : "is-failed"
              }`}
            >
              <div className="challenge-result-icon">
                {result.success ? (
                  <Trophy size={28} />
                ) : (
                  <RotateCcw size={28} />
                )}
              </div>

              <span className="challenge-result-label">
                {result.success ? "Challenge gennemført!" : "Godt forsøgt!"}
              </span>

              <strong>
                {result.score}
                {result.target ? ` / ${result.target}` : ""}
              </strong>

              <p>
                {result.success
                  ? "Du klarede målet. Flot spillet!"
                  : "Du var tæt på. Prøv igen og se om du kan slå din score."}
              </p>

              <div className="challenge-result-actions">
                <button
                  type="button"
                  className="challenge-primary-button"
                  onClick={() =>
                    startChallenge(activeChallenge, challengeSource)
                  }
                >
                  Prøv igen
                </button>

                <button
                  type="button"
                  className="challenge-secondary-button"
                  onClick={leaveChallenge}
                >
                  Til challenges
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="page-enter challenges-page">
      <header className="challenge-header">
        <button
          type="button"
          className="challenge-back"
          onClick={() => navigate("/")}
          aria-label="Tilbage til overblik"
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="challenge-eyebrow">GolfLoop Challenges</span>
          <h1>Udfordr dig selv</h1>
        </div>
      </header>

      <main className="challenges-content">
        {error && <div className="challenge-error">{error}</div>}

        <section className="daily-challenge-section">
          <div className="section-heading">
            <div>
              <span className="challenge-eyebrow">Dagens challenge</span>
              <h2>Dagens udfordring</h2>
            </div>
          </div>

          {dailyChallenge && (
            <button
              type="button"
              className="daily-challenge-card"
              onClick={() => startChallenge(dailyChallenge, "daily")}
            >
              <div className="daily-challenge-top">
                <span className="challenge-pill">{dailyChallenge.label}</span>

                <Sparkles size={21} />
              </div>

              <h3>{dailyChallenge.title}</h3>

              <p>{dailyChallenge.description}</p>

              <div className="daily-challenge-footer">
                <span>
                  {dailyChallenge.category} · {dailyChallenge.exerciseTitle}
                </span>

                <span className="challenge-arrow">Start →</span>
              </div>
            </button>
          )}
        </section>

        <section className="challenge-stats">
          <div className="challenge-stat">
            <strong>{completedCount}</strong>
            <span>Gennemført</span>
          </div>

          <div className="challenge-stat">
            <strong>{successCount}</strong>
            <span>Klaret</span>
          </div>

          <div className="challenge-stat">
            <strong>{successRate}%</strong>
            <span>Succesrate</span>
          </div>
        </section>

        <section className="challenge-options-section">
          <div className="section-heading">
            <div>
              <span className="challenge-eyebrow">Vælg selv</span>
              <h2>Udfordr dig selv</h2>
            </div>

            <button
              type="button"
              className="challenge-shuffle"
              onClick={() => setSurpriseSeed((current) => current + 1)}
            >
              <Shuffle size={17} />
              Overrask mig
            </button>
          </div>

          <div className="challenge-grid">
            {challengeOptions.map((challenge) => {
              const Icon = TYPE_INFO[challenge.type]?.icon || Target;

              const recentlyCompleted = recentChallengeKeys.has(challenge.key);

              return (
                <button
                  type="button"
                  className="challenge-option-card"
                  key={challenge.key}
                  onClick={() => startChallenge(challenge, "manual")}
                >
                  <div className="challenge-option-icon">
                    <Icon size={20} />
                  </div>

                  <div className="challenge-option-content">
                    <span>{challenge.label}</span>

                    <h3>{challenge.title}</h3>

                    <p>{challenge.description}</p>

                    <small>{challenge.category}</small>
                  </div>

                  {recentlyCompleted && (
                    <span className="challenge-completed-label">Spil igen</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="challenge-history-section">
          <div className="section-heading">
            <div>
              <span className="challenge-eyebrow">Din udvikling</span>
              <h2>Seneste challenges</h2>
            </div>
          </div>

          {completions.length === 0 ? (
            <div className="challenge-empty">
              <Trophy size={28} />
              <h3>Din challenge-historik starter her</h3>
              <p>
                Gennemfør din første challenge, og GolfLoop begynder at følge
                din udvikling.
              </p>
            </div>
          ) : (
            <div className="challenge-history">
              {completions.slice(0, 5).map((completion) => (
                <div className="challenge-history-item" key={completion.id}>
                  <div
                    className={`challenge-history-icon ${
                      completion.success ? "is-success" : "is-failed"
                    }`}
                  >
                    {completion.success ? <Check size={18} /> : <X size={18} />}
                  </div>

                  <div>
                    <strong>{completion.challenge_title}</strong>

                    <span>{completion.category || "Golf"}</span>
                  </div>

                  <div className="challenge-history-score">
                    {completion.score}
                    {completion.target_score
                      ? `/${completion.target_score}`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
