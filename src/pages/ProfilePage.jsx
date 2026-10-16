import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Wrench } from "lucide-react";
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
            Dit træningsudstyr
            <span className="heading-dot">.</span>
          </h1>

          <p className="page-lead">
            Fortæl GolfLoop hvilket udstyr du har til rådighed, så kan dine
            træningsplaner tage højde for det.
          </p>
        </div>

        <div className="page-header-icon">
          <Wrench size={24} />
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {notice && (
        <div className="alert alert-success">
          <Check size={18} />
          {notice}
        </div>
      )}

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
