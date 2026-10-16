import React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Flag, LoaderCircle, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const focusOptions = [
  { name: "Jernslag", detail: "Kontakt, længde og retning" },
  { name: "Wedges", detail: "Indspil og afstandskontrol" },
  { name: "Putting", detail: "Korte putts og afstand" },
  { name: "Driver", detail: "Præcision fra tee" },
  { name: "Bunker", detail: "Kom sikkert ud af bunkeren" },
];

export default function RoundReviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [playedAt, setPlayedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [focusAreas, setFocusAreas] = useState([]);
  const [goodAreas, setGoodAreas] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleValue(value, setter, current) {
    setter(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!focusAreas.length) {
      setError(
        "Vælg mindst ét område, du gerne vil arbejde med til næste træning.",
      );
      return;
    }
    setSaving(true);
    const { error: insertError } = await supabase.from("round_reviews").insert({
      user_id: user.id,
      played_at: playedAt,
      focus_areas: focusAreas,
      good_areas: goodAreas,
      notes: notes.trim() || null,
    });
    if (insertError) {
      setError(insertError.message || "Evalueringen kunne ikke gemmes.");
      setSaving(false);
      return;
    }
    navigate("/planner", { state: { fromReview: true } });
  }

  return (
    <div className="page-enter round-review-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">LÆR AF DIN SENESTE RUNDE</div>
          <h1>
            Efter runden<span className="heading-dot">.</span>
          </h1>
          <p className="page-lead">
            Det handler ikke kun om scoren. Notér, hvad der føltes godt, og hvad
            du vil arbejde med næste gang.
          </p>
        </div>
      </div>

      <form className="review-form-layout" onSubmit={handleSubmit}>
        <div className="review-main-column">
          <section className="form-panel review-panel">
            <div className="form-step">
              <span>01</span>
              <div>
                <h2>Hvornår spillede du?</h2>
                <p>Så kan du senere følge dine erfaringer over tid.</p>
              </div>
            </div>
            <label className="field-label" htmlFor="playedAt">
              Dato for runden
            </label>
            <input
              id="playedAt"
              className="plain-input date-input"
              type="date"
              value={playedAt}
              onChange={(event) => setPlayedAt(event.target.value)}
              required
            />
          </section>

          <section className="form-panel review-panel">
            <div className="form-step">
              <span>02</span>
              <div>
                <h2>Hvad vil du forbedre?</h2>
                <p>Vælg de områder, der drillede dig på banen.</p>
              </div>
            </div>
            <div className="review-area-list">
              {focusOptions.map((option) => {
                const checked = focusAreas.includes(option.name);
                return (
                  <button
                    type="button"
                    key={option.name}
                    className={`review-area-option ${checked ? "review-area-option-active" : ""}`}
                    onClick={() =>
                      toggleValue(option.name, setFocusAreas, focusAreas)
                    }
                    aria-pressed={checked}
                  >
                    <span
                      className={`review-area-check ${checked ? "" : "review-area-check-empty"}`}
                    >
                      {checked && <Check size={15} />}
                    </span>
                    <span className="review-area-copy">
                      <strong>{option.name}</strong>
                      <small>{option.detail}</small>
                    </span>
                    <span className="review-area-hint">
                      {checked ? "Valgt" : "Vælg"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="form-panel review-panel">
            <div className="form-step">
              <span>03</span>
              <div>
                <h2>Hvad gik godt?</h2>
                <p>Det er også værd at fastholde dine styrker. (Valgfrit)</p>
              </div>
            </div>
            <div className="good-area-chips">
              {focusOptions.map((option) => (
                <button
                  type="button"
                  key={option.name}
                  onClick={() =>
                    toggleValue(option.name, setGoodAreas, goodAreas)
                  }
                  className={`good-area-chip ${goodAreas.includes(option.name) ? "good-area-chip-active" : ""}`}
                  aria-pressed={goodAreas.includes(option.name)}
                >
                  {goodAreas.includes(option.name) && <Check size={14} />}
                  {option.name}
                </button>
              ))}
            </div>
          </section>

          <section className="form-panel review-panel">
            <div className="form-step">
              <span>04</span>
              <div>
                <h2>Tilføj en note</h2>
                <p>Notér en situation, du gerne vil huske til næste gang.</p>
              </div>
            </div>
            <textarea
              className="plain-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="Fx: Jeg havde svært ved at kontrollere længden på mine wedges fra 40–60 meter, og jeg missede et par korte putts…"
            />
            <div className="character-count">{notes.length}/1200</div>
          </section>
          {error && <div className="alert alert-error">{error}</div>}
          <button
            className="button button-primary button-large review-submit"
            type="submit"
            disabled={saving}
          >
            {saving ? (
              <>
                <LoaderCircle size={18} className="spin" /> Gemmer evaluering…
              </>
            ) : (
              <>
                Gem og planlæg næste træning <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        <aside className="review-aside">
          <div className="review-aside-icon">
            <Sparkles size={21} />
          </div>
          <h2>Gør erfaring til fremgang</h2>
          <p>
            Når du gemmer din evaluering, kan du bruge dine fokusområder til at
            sammensætte en målrettet træning.
          </p>
          <div className="review-flow">
            <div>
              <span>1</span>
              <p>Vælg dine fokusområder</p>
            </div>
            <div>
              <span>2</span>
              <p>Få forslag til relevante øvelser</p>
            </div>
            <div>
              <span>3</span>
              <p>Registrér resultaterne næste gang</p>
            </div>
          </div>
          <div className="review-aside-quote">
            “Det er lettere at forbedre noget, når du ved, hvad du arbejder
            med.”
          </div>
        </aside>
      </form>
    </div>
  );
}
