import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../core/bridge";
import { PosterCard } from "../../shared/ui/PosterCard";

export function CatalogPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const { data: addons = [] } = useQuery({ queryKey: ["addons"], queryFn: api.listAddons });

  const searchable = addons.flatMap((addon) =>
    addon.manifest.catalogs
      .filter((catalog) => catalog.extra.some((extra) => extra.name === "search"))
      .map((catalog) => ({ ...catalog, addonId: addon.manifest.id })),
  );

  const [selected, setSelected] = useState(0);
  const current = searchable[selected];

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["search", current?.addonId, current?.id, query],
    queryFn: () => api.getCatalog(current!.type, current!.id, query ? { search: query } : {}),
    enabled: Boolean(current),
  });

  return (
    <main className="page container">
      <section className="section">
        <div className="section-head">
          <h2>Discover</h2>
          <span>aggregated search across add-ons</span>
        </div>
        <form
          className="search"
          style={{ width: "100%", marginBottom: 18 }}
          onSubmit={(event) => {
            event.preventDefault();
            setParams(query.trim() ? { q: query.trim() } : {});
          }}
        >
          <input
            value={query}
            onChange={(event) => setParams({ q: event.target.value })}
            placeholder="Title, person, genre..."
            aria-label="Search term"
          />
        </form>

        {searchable.length > 1 && (
          <div className="chips">
            {searchable.map((catalog, index) => (
              <button
                key={`${catalog.addonId}:${catalog.id}`}
                className={`chip ${index === selected ? "active" : ""}`}
                onClick={() => setSelected(index)}
              >
                {catalog.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="grid">
          {Array.from({ length: 10 }, (_, index) => <div className="skeleton" key={index} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <strong>{query ? `No results for “${query}”` : "Type something to search"}</strong>
          <span>Not every add-on supports search — check its manifest.</span>
        </div>
      ) : (
        <div className="grid">
          {items.map((item) => (
            <PosterCard
              key={`${item.type}:${item.id}`}
              item={item}
              onOpen={() => navigate(`/details/${item.type}/${encodeURIComponent(item.id)}`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
