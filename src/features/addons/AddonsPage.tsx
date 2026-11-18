import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../core/bridge";

export function AddonsPage() {
  const client = useQueryClient();
  const { data: addons = [], isLoading } = useQuery({ queryKey: ["addons"], queryFn: api.listAddons });
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const install = useMutation({
    mutationFn: (manifestUrl: string) => api.installAddon(manifestUrl),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["addons"] });
      setUrl("");
      setFeedback({ text: "Add-on installed.", ok: true });
    },
    onError: (error) => setFeedback({ text: String(error), ok: false }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.uninstallAddon(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["addons"] }),
  });

  return (
    <main className="page container">
      <section className="section">
        <div className="section-head"><h2>Install add-on</h2><span>Stremio protocol</span></div>
        <form
          className="install-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) install.mutate(url.trim());
          }}
        >
          <input
            className="input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/manifest.json"
            aria-label="Manifest URL"
          />
          <button className="btn btn-primary" disabled={install.isPending || !url.trim()}>
            {install.isPending ? "Installing..." : "Install"}
          </button>
        </form>
        {feedback && (
          <div className={`notice ${feedback.ok ? "ok" : "error"}`} style={{ marginTop: 12 }}>
            {feedback.text}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Installed</h2><span>{addons.length}</span></div>
        {isLoading ? (
          <div className="addon-list"><div className="skeleton" /></div>
        ) : addons.length === 0 ? (
          <div className="empty">
            <strong>No add-ons</strong>
            <span>Tip: run <code>npm run addon:dev</code> and install http://localhost:7000/manifest.json</span>
          </div>
        ) : (
          <div className="addon-list">
            {addons.map((addon) => (
              <div className="addon-card" key={addon.manifest.id}>
                {addon.manifest.logo ? (
                  <img className="addon-logo" src={addon.manifest.logo} alt="" />
                ) : (
                  <div className="addon-logo" />
                )}
                <div className="addon-info">
                  <strong>{addon.manifest.name}</strong>
                  <small>{addon.transportUrl}</small>
                  <small>v{addon.manifest.version} · {addon.manifest.resources.length} resource(s)</small>
                </div>
                <button
                  className="btn btn-danger"
                  title="Remove"
                  onClick={() => remove.mutate(addon.manifest.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
