import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Blocks, Coins, Compass, Home, Library, Search, Settings, User } from "lucide-react";
import mark from "../assets/uvideo-mark-sm.png";
import { api, events } from "../core/bridge";
import { formatCredits, getCredits, subscribeCredits } from "../core/credits";
import { syncAdapters, watchConsent } from "../core/data-monetization";
import { AddonsPage } from "../features/addons/AddonsPage";
import { LoginPage } from "../features/auth/LoginPage";
import { BoardPage } from "../features/board/BoardPage";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { DetailsPage } from "../features/details/DetailsPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { PlayerPage } from "../features/player/PlayerPage";
import { SettingsPage } from "../features/settings/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/library", label: "Library", icon: Library, end: false },
  { to: "/addons", label: "Add-ons", icon: Blocks, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

function Shell() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState(getCredits());

  useEffect(() => {
    const unsubscribeCredits = subscribeCredits(setCredits);
    const unsubscribeConsent = watchConsent();
    void syncAdapters();
    const subscriptions = [
      events.onAddonsChanged(() => client.invalidateQueries({ queryKey: ["addons"] })),
      events.onLibraryChanged(() => client.invalidateQueries({ queryKey: ["library"] })),
      events.onDeepLink(async (manifestUrl) => {
        try {
          await api.installAddon(manifestUrl);
          client.invalidateQueries({ queryKey: ["addons"] });
          navigate("/addons");
        } catch (reason) {
          setError(String(reason));
        }
      }),
    ];
    return () => {
      unsubscribeCredits();
      unsubscribeConsent();
      for (const subscription of subscriptions) {
        void subscription.then((unlisten) => unlisten());
      }
    };
  }, [client, navigate]);

  return (
    <div className="app">
      <div className="utility-bar desktop-only">
        <div className="container">
          <span>ultravideo · movies, series &amp; TV</span>
          <span className="utility-links">
            <button onClick={() => navigate("/login")}>Sign in</button>
            <button onClick={() => navigate("/settings")}>Subscribe</button>
          </span>
        </div>
      </div>

      <header className="navbar">
        <div className="container navbar-inner">
          <button className="brand" onClick={() => navigate("/")} aria-label="ultravideo home">
            <img src={mark} alt="ultravideo" className="brand-logo" />
          </button>

          <nav className="nav desktop-only">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="navbar-spacer" />
          <form
            className="search desktop-only"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/discover?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." aria-label="Search" />
          </form>
          <span className="coin-pill" title="ucoins balance">
            <Coins size={12} /> {formatCredits(credits)}
          </span>
          <button className="icon-btn" aria-label="Account" onClick={() => navigate("/login")}>
            <User size={16} />
          </button>
        </div>
      </header>

      {error && <div className="container" style={{ marginTop: 12 }}><div className="notice error">{error}</div></div>}

      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/discover" element={<CatalogPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/addons" element={<AddonsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/details/:kind/:id" element={<DetailsPage />} />
        <Route path="/player" element={<PlayerPage />} />
      </Routes>

      <nav className="bottom-nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
