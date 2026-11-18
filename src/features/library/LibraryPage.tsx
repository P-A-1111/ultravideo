import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../core/bridge";
import { PosterCard } from "../../shared/ui/PosterCard";

type Tab = "favorites" | "continue";

export function LibraryPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ["library"], queryFn: api.getLibrary });
  const [tab, setTab] = useState<Tab>("favorites");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const target = await save({
        defaultPath: `ultravideo-sync-${Date.now()}.json`,
        filters: [{ name: "ultravideo sync", extensions: ["json"] }],
      });
      if (!target || Array.isArray(target)) return null;
      return api.exportSyncFile(target);
    },
    onSuccess: (result) => {
      if (result) setNotice({ text: `Saved ${result.entries} items to ${result.path}`, ok: true });
    },
    onError: (error) => setNotice({ text: String(error), ok: false }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const source = await open({
        multiple: false,
        filters: [{ name: "ultravideo sync", extensions: ["json"] }],
      });
      if (!source || Array.isArray(source)) return null;
      return api.importSyncFile(source);
    },
    onSuccess: (result) => {
      if (!result) return;
      client.invalidateQueries({ queryKey: ["library"] });
      setNotice({ text: `${result.applied}/${result.total} items merged.`, ok: true });
    },
    onError: (error) => setNotice({ text: String(error), ok: false }),
  });

  const visible = items.filter((item) =>
    tab === "favorites" ? item.favorite : item.progress > 0 && !item.watched,
  );

  return (
    <main className="page container">
      <section className="section">
        <div className="section-head"><h2>Library</h2><span>{items.length} item(s)</span></div>
        <div className="chips">
          <button className={`chip ${tab === "favorites" ? "active" : ""}`} onClick={() => setTab("favorites")}>Favorites</button>
          <button className={`chip ${tab === "continue" ? "active" : ""}`} onClick={() => setTab("continue")}>Continue watching</button>
        </div>
        <div style={{ height: 18 }} />
        {visible.length === 0 ? (
          <div className="empty"><strong>Nothing here yet</strong><span>Favorite a title or start watching.</span></div>
        ) : (
          <div className="grid">
            {visible.map((item) => (
              <PosterCard
                key={item.id}
                item={{
                  id: item.id,
                  type: item.kind,
                  name: item.name,
                  poster: item.poster,
                  extensions: {},
                }}
                progress={item.progress}
                onOpen={() => navigate(`/details/${item.kind}/${encodeURIComponent(item.id)}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Sync</h2><span>local-first · free</span></div>
        <div className="notice">
          Your data stays on this device. Export the file and put it on Drive, Dropbox or OneDrive to use it on another device.
          Add-ons are not included (their URLs may contain tokens).
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
            <Download size={16} /> Export file
          </button>
          <button className="btn" disabled={importMutation.isPending} onClick={() => importMutation.mutate()}>
            <Upload size={16} /> Import file
          </button>
        </div>
        {notice && (
          <div className={`notice ${notice.ok ? "ok" : "error"}`} style={{ marginTop: 12 }}>{notice.text}</div>
        )}
      </section>
    </main>
  );
}
