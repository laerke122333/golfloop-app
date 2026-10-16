import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  Flag,
  History,
  LogOut,
  Menu,
  PlusCircle,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Overblik", icon: Activity, end: true },
  { to: "/planner", label: "Planlæg træning", icon: CalendarDays },
  { to: "/history", label: "Tidligere", icon: History },
  { to: "/round-review", label: "Efter runden", icon: Flag },
  { to: "/profile", label: "Min profil", icon: Activity },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function handleSignOut() {
    const { error } = await signOut();
    if (error) {
      setSignOutError(error.message || "Du kunne ikke logges ud.");
      return;
    }
    navigate("/login");
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="mobile-overlay"
          aria-label="Luk menu"
          onClick={closeMobile}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Flag size={22} strokeWidth={2.2} />
          </div>
          <div>
            <div className="brand-name">
              GolfLoop<span>.</span>
            </div>
            <div className="brand-tagline">Train with purpose</div>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={closeMobile}
            aria-label="Luk menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-caption">DIT GOLFUNIVERS</div>
        <nav className="side-nav" aria-label="Hovednavigation">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-item ${isActive ? "nav-item-active" : ""}`
              }
              onClick={closeMobile}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-tip">
          <div className="tip-icon">
            <Sparkles size={18} />
          </div>
          <p className="tip-title">Små fremskridt tæller</p>
          <p className="tip-copy">
            Målrettet træning begynder med ét fokusområde.
          </p>
          <button
            onClick={() => {
              navigate("/planner");
              closeMobile();
            }}
            className="tip-link"
          >
            Planlæg træning <span>→</span>
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="avatar">
            {(user?.email?.[0] || "G").toUpperCase()}
          </div>
          <div className="user-meta">
            <strong>Min profil</strong>
            <span title={user?.email}>{user?.email || "Golfspiller"}</span>
          </div>
          <button
            className="icon-button logout-icon"
            onClick={handleSignOut}
            title="Log ud"
            aria-label="Log ud"
          >
            <LogOut size={18} />
          </button>
        </div>
        {signOutError && <p className="sidebar-error">{signOutError}</p>}
      </aside>

      <main className="main-area">
        <header className="mobile-header">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Åbn menu"
          >
            <Menu size={22} />
          </button>
          <div className="mobile-brand">
            <Flag size={19} /> GolfLoop<span>.</span>
          </div>
          <button
            className="quick-add"
            onClick={() => navigate("/round-review")}
            aria-label="Registrer golfrunde"
          >
            <PlusCircle size={21} />
          </button>
        </header>
        <div className="page-container">
          <Outlet />
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobil navigation">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `mobile-bottom-nav-item ${
                isActive ? "mobile-bottom-nav-item-active" : ""
              }`
            }
          >
            <Icon size={21} strokeWidth={1.9} />

            <span>
              {to === "/" && "Overblik"}
              {to === "/planner" && "Træning"}
              {to === "/history" && "Tidligere"}
              {to === "/round-review" && "Runden"}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
