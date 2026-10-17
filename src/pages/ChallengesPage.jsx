import React, { useEffect, useMemo, useRef, useState } from "react";
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

/* =========================================================
   CHALLENGE TYPES
   ========================================================= */

const CHALLENGE_TYPES = [
  "precision",
  "streak",
  "personal_best",
  "timed",
  "skill",
  "lucky",
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
  timed: {
    label: "Mod uret",
    icon: Clock3,
    description: "Hvor mange gode bolde kan du nå?",
  },
  skill: {
    label: "Skill Challenge",
    icon: Target,
    description: "Test en bestemt færdighed.",
  },
  lucky: {
    label: "Lucky Seven",
    icon: Sparkles,
    description: "7 forsøg. Gør dem tælle.",
  },
};

/* =========================================================
   CATEGORIES
   ========================================================= */

const CATEGORY_ORDER = ["Putting", "Wedges", "Jernslag", "Driver", "Bunker"];

/* =========================================================
   HELPERS
   ========================================================= */

function hashString(value) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeCategory(value) {
  if (!value) return null;

  const text = String(value).trim().toLowerCase();

  if (text.includes("putt")) return "Putting";
  if (text.includes("wedge") || text.includes("short game")) {
    return "Wedges";
  }
  if (text.includes("jern") || text.includes("iron")) {
    return "Jernslag";
  }
  if (text.includes("driver")) return "Driver";
  if (text.includes("bunker")) return "Bunker";

  return null;
}

function getCategoryPriority(latestReview, exercises) {
  const reviewCategories = latestReview?.focus_areas || [];

  const reviewPriority = reviewCategories
    .map(normalizeCategory)
    .filter(Boolean);

  const availableCategories = [
    ...new Set(exercises.map((exercise) => exercise.category)),
  ];

  const ordered = [
    ...reviewPriority,
    ...CATEGORY_ORDER,
    ...availableCategories,
  ];

  return [...new Set(ordered)].filter((category) =>
    availableCategories.includes(category),
  );
}

function pickExercise(
  exercises,
  preferredCategories,
  seed = Math.random(),
  excludedIds = [],
) {
  if (!exercises.length) return null;

  const available = exercises.filter(
    (exercise) => !excludedIds.includes(exercise.id),
  );

  const pool = available.length ? available : exercises;

  for (const category of preferredCategories) {
    const matching = pool.filter((exercise) => exercise.category === category);

    if (matching.length) {
      const index = Math.floor(seed * matching.length);

      return matching[index];
    }
  }

  return pool[Math.floor(seed * pool.length)];
}

function getPersonalBest(completions, exerciseId) {
  if (!exerciseId) return 0;

  const scores = completions
    .filter(
      (completion) =>
        completion.exercise_id === exerciseId &&
        completion.challenge_type === "personal_best",
    )
    .map((completion) => Number(completion.score) || 0);

  return scores.length ? Math.max(...scores) : 0;
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

function getCurrentSuccessStreak(completions) {
  const successfulDates = new Set(
    completions
      .filter((completion) => completion.success)
      .map((completion) => getDateKey(new Date(completion.created_at))),
  );

  if (!successfulDates.size) {
    return 0;
  }

  const today = new Date();
  const todayKey = getDateKey(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayKey = getDateKey(yesterday);

  let startDate = null;

  if (successfulDates.has(todayKey)) {
    startDate = today;
  } else if (successfulDates.has(yesterdayKey)) {
    startDate = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  const cursor = new Date(startDate);

  while (successfulDates.has(getDateKey(cursor))) {
    streak += 1;

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getWeekCount(completions) {
  const now = new Date();

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  return completions.filter((completion) => {
    const date = new Date(completion.created_at);

    return date >= sevenDaysAgo;
  }).length;
}

function getJourney(completedCount) {
  if (completedCount >= 50) {
    return {
      title: "GolfLoop Master",
      currentMilestone: 50,
      nextMilestone: null,
      progress: 1,
      progressCount: 50,
      remaining: 0,
    };
  }

  if (completedCount >= 25) {
    return {
      title: "Challenge spiller",
      currentMilestone: 25,
      nextMilestone: 50,
      progress: (completedCount - 25) / 25,
      progressCount: completedCount - 25,
      remaining: 50 - completedCount,
    };
  }

  if (completedCount >= 10) {
    return {
      title: "Dedikeret",
      currentMilestone: 10,
      nextMilestone: 25,
      progress: (completedCount - 10) / 15,
      progressCount: completedCount - 10,
      remaining: 25 - completedCount,
    };
  }

  if (completedCount >= 5) {
    return {
      title: "På vej frem",
      currentMilestone: 5,
      nextMilestone: 10,
      progress: (completedCount - 5) / 5,
      progressCount: completedCount - 5,
      remaining: 10 - completedCount,
    };
  }

  return {
    title: "Kom godt i gang",
    currentMilestone: 0,
    nextMilestone: 5,
    progress: completedCount / 5,
    progressCount: completedCount,
    remaining: 5 - completedCount,
  };
}

/* =========================================================
   BUILD CHALLENGE
   ========================================================= */

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
        title: "Ram 8 ud af 10",
        description: `Test din præcision i ${exercise.title}.`,
        instruction: "Du har 10 forsøg. Ram mindst 8 gode bolde.",
        attempts: 10,
        target: 8,
        mode: "attempts",
        durationSeconds: null,
        personalBestBefore: previousBest,
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
        description: "Hvor længe kan du holde den kørende?",
        instruction: "Du har 10 forsøg. Lav mindst 5 gode bolde i træk.",
        attempts: 10,
        target: 5,
        mode: "streak",
        durationSeconds: null,
        personalBestBefore: previousBest,
      };

    case "personal_best": {
      const target = previousBest >= 10 ? 10 : previousBest + 1 || 7;

      return {
        key,
        type,
        label: "Personlig rekord",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title:
          previousBest >= 10
            ? "Forsvar din rekord på 10"
            : previousBest > 0
              ? `Slå din rekord på ${previousBest}`
              : "Sæt din første rekord",
        description:
          previousBest > 0
            ? `Din bedste score er ${previousBest}. Kan du gøre det bedre?`
            : "Sæt dit første personlige resultat.",
        instruction:
          previousBest > 0
            ? `Du skal bruge 10 forsøg. Målet er ${target}.`
            : "Du skal bruge 10 forsøg. Dit resultat bliver din første rekord.",
        attempts: 10,
        target,
        mode: "attempts",
        durationSeconds: null,
        personalBestBefore: previousBest,
      };
    }

    case "timed":
      return {
        key,
        type,
        label: "Mod uret",
        category: exercise.category,
        exerciseId: exercise.id,
        exerciseTitle: exercise.title,
        title: "5 minutter. Gør dem tælle.",
        description: `Hvor mange gode bolde kan du nå i ${exercise.title}?`,
        instruction: "Du har 5 minutter. Registrér hver god bold.",
        attempts: null,
        target: 20,
        mode: "timed",
        durationSeconds: 300,
        personalBestBefore: previousBest,
      };

    case "skill":
      return {
        key,
        type,
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
        durationSeconds: null,
        personalBestBefore: previousBest,
      };

    case "lucky":
    default:
      return {
        key,
        type: "lucky",
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
        durationSeconds: null,
        personalBestBefore: previousBest,
      };
  }
}

/* =========================================================
   PAGE
   ========================================================= */

export default function ChallengesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exercises, setExercises] = useState([]);

  const [latestReview, setLatestReview] = useState(null);

  const [completions, setCompletions] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [activeChallenge, setActiveChallenge] = useState(null);

  const [attempts, setAttempts] = useState([]);

  const [timedScore, setTimedScore] = useState(0);

  const timedScoreRef = useRef(0);

  const [timeLeft, setTimeLeft] = useState(0);

  const [saving, setSaving] = useState(false);

  const [result, setResult] = useState(null);

  const [surpriseChallenge, setSurpriseChallenge] = useState(null);

  const [surpriseSeed, setSurpriseSeed] = useState(0);

  /* =======================================================
     LOAD DATA
     ======================================================= */

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

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
            .order("played_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle(),

          supabase
            .from("challenge_completions")
            .select(
              "id,challenge_key,challenge_type,challenge_title,category,exercise_id,score,target_score,total_attempts,duration_seconds,success,created_at",
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(100),
        ]);

      if (!active) return;

      const errors = [];

      if (exerciseResult.error) {
        errors.push(
          `Kunne ikke hente øvelser: ${exerciseResult.error.message}`,
        );
      }

      if (reviewResult.error) {
        errors.push(
          `Kunne ikke hente seneste evaluering: ${reviewResult.error.message}`,
        );
      }

      if (completionResult.error) {
        errors.push(
          `Kunne ikke hente dine challenges: ${completionResult.error.message}`,
        );
      }

      if (errors.length) {
        setError(errors[0]);
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

  /* =======================================================
     CATEGORY PRIORITY
     ======================================================= */

  const preferredCategories = useMemo(
    () => getCategoryPriority(latestReview, exercises),
    [latestReview, exercises],
  );

  /* =======================================================
     DAILY CHALLENGE
     ======================================================= */

  const dailyChallenge = useMemo(() => {
    if (!user?.id || !exercises.length) {
      return null;
    }

    const dateKey = getDateKey();

    const seed = hashString(`${user.id}-${dateKey}`);

    const type = CHALLENGE_TYPES[seed % CHALLENGE_TYPES.length];

    const exercise = pickExercise(
      exercises,
      preferredCategories,
      (seed % 1000) / 1000,
    );

    if (!exercise) return null;

    const previousBest = getPersonalBest(completions, exercise.id);

    return buildChallenge({
      type,
      exercise,
      previousBest,
      key: `daily-${dateKey}-${type}-${exercise.id}`,
    });
  }, [user?.id, exercises, preferredCategories, completions]);

  /* =======================================================
     CHALLENGE OPTIONS
     ======================================================= */

  const challengeOptions = useMemo(() => {
    if (!exercises.length) {
      return [];
    }

    const types = ["precision", "streak", "personal_best", "timed"];

    return types
      .map((type, index) => {
        const exercise = pickExercise(
          exercises,
          preferredCategories,
          (((index + 1 + surpriseSeed) * 37) % 100) / 100,
        );

        if (!exercise) return null;

        const previousBest = getPersonalBest(completions, exercise.id);

        return buildChallenge({
          type,
          exercise,
          previousBest,
          key: `option-${type}-${exercise.id}-${surpriseSeed}`,
        });
      })
      .filter(Boolean);
  }, [exercises, preferredCategories, completions, surpriseSeed]);

  /* =======================================================
     SURPRISE CHALLENGE
     ======================================================= */

  function createSurpriseChallenge() {
    if (!exercises.length) return;

    const randomType =
      CHALLENGE_TYPES[Math.floor(Math.random() * CHALLENGE_TYPES.length)];

    const randomExercise = pickExercise(
      exercises,
      preferredCategories,
      Math.random(),
    );

    if (!randomExercise) return;

    const previousBest = getPersonalBest(completions, randomExercise.id);

    const challenge = buildChallenge({
      type: randomType,
      exercise: randomExercise,
      previousBest,
      key: `surprise-${randomType}-${randomExercise.id}`,
    });

    setSurpriseSeed((current) => current + 1);

    setSurpriseChallenge(challenge);
  }

  /* =======================================================
     STATS
     ======================================================= */

  const completedCount = completions.length;

  const successCount = completions.filter(
    (completion) => completion.success,
  ).length;

  const successRate =
    completedCount > 0 ? Math.round((successCount / completedCount) * 100) : 0;

  const currentStreak = useMemo(
    () => getCurrentSuccessStreak(completions),
    [completions],
  );

  const weekCount = useMemo(() => getWeekCount(completions), [completions]);

  const journey = useMemo(() => getJourney(completedCount), [completedCount]);

  const dailyCompleted = dailyChallenge
    ? completions.some(
        (completion) => completion.challenge_key === dailyChallenge.key,
      )
    : false;

  /* =======================================================
     TIMER
     ======================================================= */

  useEffect(() => {
    if (
      !activeChallenge ||
      activeChallenge.mode !== "timed" ||
      timeLeft <= 0 ||
      result
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTimeLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [activeChallenge, timeLeft, result]);

  useEffect(() => {
    if (
      !activeChallenge ||
      activeChallenge.mode !== "timed" ||
      timeLeft !== 0 ||
      result ||
      saving
    ) {
      return;
    }

    finishTimedChallenge(timedScoreRef.current);
  }, [activeChallenge, timeLeft, result, saving]);

  /* =======================================================
     START CHALLENGE
     ======================================================= */

  function startChallenge(challenge) {
    if (!challenge) return;

    setError("");
    setResult(null);
    setAttempts([]);

    timedScoreRef.current = 0;
    setTimedScore(0);

    setSaving(false);
    setActiveChallenge(challenge);

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

  /* =======================================================
     ATTEMPTS
     ======================================================= */

  function registerAttempt(success) {
    if (!activeChallenge || saving || result) {
      return;
    }

    const nextAttempts = [...attempts, success];

    setAttempts(nextAttempts);

    if (nextAttempts.length >= activeChallenge.attempts) {
      finishAttemptChallenge(nextAttempts);
    }
  }

  /* =======================================================
     FINISH NORMAL CHALLENGE
     ======================================================= */

  async function finishAttemptChallenge(finalAttempts) {
    if (!activeChallenge || saving) {
      return;
    }

    const score = finalAttempts.filter(Boolean).length;

    const bestStreak = getBestStreak(finalAttempts);

    const finalScore = activeChallenge.type === "streak" ? bestStreak : score;

    let success = finalScore >= activeChallenge.target;

    const isNewRecord =
      activeChallenge.type === "personal_best" &&
      finalScore > (activeChallenge.personalBestBefore || 0);

    setSaving(true);
    setError("");

    const { error: insertError } = await supabase
      .from("challenge_completions")
      .insert({
        user_id: user.id,
        challenge_key: activeChallenge.key,
        challenge_type: activeChallenge.type,
        challenge_title: activeChallenge.title,
        category: activeChallenge.category,
        exercise_id: activeChallenge.exerciseId,
        score: finalScore,
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

    const completion = {
      id: `local-${Date.now()}`,
      challenge_key: activeChallenge.key,
      challenge_type: activeChallenge.type,
      challenge_title: activeChallenge.title,
      category: activeChallenge.category,
      exercise_id: activeChallenge.exerciseId,
      score: finalScore,
      target_score: activeChallenge.target,
      total_attempts: finalAttempts.length,
      duration_seconds: null,
      success,
      created_at: new Date().toISOString(),
    };

    setCompletions((current) => [completion, ...current]);

    setResult({
      score: finalScore,
      target: activeChallenge.target,
      success,
      type: activeChallenge.type,
      isNewRecord,
      streak: activeChallenge.type === "streak" ? bestStreak : null,
    });

    setSaving(false);
  }

  /* =======================================================
     TIMED CHALLENGE
     ======================================================= */

  function addTimedSuccess() {
    if (
      !activeChallenge ||
      activeChallenge.mode !== "timed" ||
      timeLeft <= 0 ||
      saving ||
      result
    ) {
      return;
    }

    const nextScore = timedScoreRef.current + 1;

    timedScoreRef.current = nextScore;

    setTimedScore(nextScore);
  }

  async function finishTimedChallenge(scoreOverride) {
    if (!activeChallenge || saving || result) {
      return;
    }

    const score =
      typeof scoreOverride === "number" ? scoreOverride : timedScoreRef.current;

    const success = score >= activeChallenge.target;

    setSaving(true);
    setError("");

    const durationSeconds = Math.max(
      1,
      activeChallenge.durationSeconds - timeLeft,
    );

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
        duration_seconds: durationSeconds,
        success,
      });

    if (insertError) {
      setError(`Resultatet kunne ikke gemmes: ${insertError.message}`);
      setSaving(false);
      return;
    }

    const completion = {
      id: `local-${Date.now()}`,
      challenge_key: activeChallenge.key,
      challenge_type: activeChallenge.type,
      challenge_title: activeChallenge.title,
      category: activeChallenge.category,
      exercise_id: activeChallenge.exerciseId,
      score,
      target_score: activeChallenge.target,
      total_attempts: null,
      duration_seconds: durationSeconds,
      success,
      created_at: new Date().toISOString(),
    };

    setCompletions((current) => [completion, ...current]);

    setResult({
      score,
      target: activeChallenge.target,
      success,
      type: activeChallenge.type,
      isNewRecord: false,
      streak: null,
    });

    setSaving(false);
  }

  /* =======================================================
     LEAVE
     ======================================================= */

  function leaveChallenge() {
    setActiveChallenge(null);

    setResult(null);
    setAttempts([]);

    timedScoreRef.current = 0;

    setTimedScore(0);
    setTimeLeft(0);
    setSaving(false);
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);

    const remaining = seconds % 60;

    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading) {
    return (
      <div className="page-enter challenges-page">
        <div className="challenge-loading">Henter dine challenges...</div>
      </div>
    );
  }

  /* =======================================================
     ACTIVE CHALLENGE
     ======================================================= */

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

            {/* NORMAL CHALLENGE */}

            {activeChallenge.mode !== "timed" ? (
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
                    {
                      length: activeChallenge.attempts,
                    },
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
            ) : (
              /* TIMED CHALLENGE */
              <>
                <div className="challenge-timer">{formatTime(timeLeft)}</div>

                <div className="challenge-live-score">
                  <strong>{timedScore}</strong>

                  <span>gode bolde</span>
                </div>

                {!result && (
                  <>
                    <button
                      type="button"
                      className="challenge-primary-button challenge-big-button"
                      onClick={addTimedSuccess}
                      disabled={timeLeft <= 0 || saving}
                    >
                      <Check size={22} />
                      God bold
                    </button>

                    {timeLeft > 0 && (
                      <button
                        type="button"
                        className="challenge-secondary-button challenge-stop-button"
                        onClick={() => finishTimedChallenge()}
                        disabled={saving}
                      >
                        Afslut
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* RESULT */}

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
                {result.isNewRecord
                  ? "Ny personlig rekord!"
                  : result.success
                    ? "Challenge gennemført!"
                    : "Godt forsøgt!"}
              </span>

              <strong>
                {result.score}
                {result.target ? ` / ${result.target}` : ""}
              </strong>

              {result.streak && (
                <div className="challenge-result-streak">
                  🔥 {result.streak} i træk
                </div>
              )}

              <p>
                {result.isNewRecord
                  ? "Du har sat en ny personlig rekord. Den bliver svær at slå!"
                  : result.success
                    ? "Du klarede målet. Flot spillet!"
                    : "Du var tæt på. Prøv igen og se om du kan slå din score."}
              </p>

              <div className="challenge-result-actions">
                <button
                  type="button"
                  className="challenge-primary-button"
                  onClick={() => startChallenge(activeChallenge)}
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

  /* =======================================================
     MAIN CHALLENGE PAGE
     ======================================================= */

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

        {/* =================================================
            DAILY CHALLENGE
            ================================================= */}

        <section className="daily-challenge-section">
          <div className="section-heading">
            <div>
              <span className="challenge-eyebrow">Dagens challenge</span>

              <h2>Dagens udfordring</h2>
            </div>

            {dailyCompleted && (
              <span className="daily-completed-badge">
                <Check size={14} />
                Gennemført
              </span>
            )}
          </div>

          {dailyChallenge && (
            <button
              type="button"
              className="daily-challenge-card"
              onClick={() => startChallenge(dailyChallenge)}
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

                <span className="challenge-arrow">
                  {dailyCompleted ? "Spil igen →" : "Start →"}
                </span>
              </div>
            </button>
          )}
        </section>

        {/* =================================================
            STATS
            ================================================= */}

        <section className="challenge-stats">
          <div className="challenge-stat">
            <strong>{currentStreak}</strong>

            <span>🔥 Dages streak</span>
          </div>

          <div className="challenge-stat">
            <strong>{weekCount}</strong>

            <span>Denne uge</span>
          </div>

          <div className="challenge-stat">
            <strong>{successRate}%</strong>

            <span>Succesrate</span>
          </div>
        </section>

        {/* =================================================
            JOURNEY
            ================================================= */}

        <section className="challenge-journey">
          <div className="journey-header">
            <div>
              <span className="challenge-eyebrow">Din udvikling</span>

              <h2>{journey.title}</h2>
            </div>

            <div className="journey-count">
              {completedCount}
              {journey.nextMilestone ? ` / ${journey.nextMilestone}` : "+"}
            </div>
          </div>

          <div className="journey-progress">
            <div
              className="journey-progress-fill"
              style={{
                width: `${Math.min(journey.progress * 100, 100)}%`,
              }}
            />
          </div>

          <div className="journey-footer">
            <span>
              {journey.nextMilestone
                ? `${journey.remaining} challenges til næste milepæl`
                : "Du har nået GolfLoop Master"}
            </span>

            {journey.nextMilestone && <span>🏆 {journey.nextMilestone}</span>}
          </div>
        </section>

        {/* =================================================
            CHOOSE CHALLENGE
            ================================================= */}

        <section className="challenge-options-section">
          <div className="section-heading">
            <div>
              <span className="challenge-eyebrow">Vælg selv</span>

              <h2>Hvad vil du udfordre?</h2>
            </div>

            <button
              type="button"
              className="challenge-shuffle"
              onClick={createSurpriseChallenge}
            >
              <Shuffle size={17} />
              Overrask mig
            </button>
          </div>

          {/* SURPRISE */}

          {surpriseChallenge && (
            <div className="surprise-challenge-card">
              <div>
                <span className="challenge-eyebrow">GolfLoop har valgt</span>

                <h3>{surpriseChallenge.title}</h3>

                <p>{surpriseChallenge.description}</p>

                <span className="surprise-meta">
                  {surpriseChallenge.category} ·{" "}
                  {surpriseChallenge.exerciseTitle}
                </span>
              </div>

              <div className="surprise-actions">
                <button
                  type="button"
                  className="challenge-primary-button"
                  onClick={() => startChallenge(surpriseChallenge)}
                >
                  Start →
                </button>

                <button
                  type="button"
                  className="challenge-secondary-button"
                  onClick={createSurpriseChallenge}
                >
                  Ny challenge
                </button>
              </div>
            </div>
          )}

          <div className="challenge-grid">
            {challengeOptions.map((challenge) => {
              const Icon = TYPE_INFO[challenge.type]?.icon || Target;

              return (
                <button
                  type="button"
                  className="challenge-option-card"
                  key={challenge.key}
                  onClick={() => startChallenge(challenge)}
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
                </button>
              );
            })}
          </div>
        </section>

        {/* =================================================
            RECENT HISTORY
            ================================================= */}

        <section className="challenge-history-section">
          <div className="section-heading">
            <div>
              <span className="challenge-eyebrow">Seneste resultater</span>

              <h2>Din challenge-historik</h2>
            </div>
          </div>

          {completions.length === 0 ? (
            <div className="challenge-empty">
              <Trophy size={28} />

              <h3>Din challenge-rejse starter her</h3>

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
