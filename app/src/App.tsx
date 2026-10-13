import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteMap, located } from "@/components/SiteMap";
import { loadData, type LoadError, type SiteRecord } from "@/lib/api";
import { text } from "@/text";

type State = { sites: SiteRecord[] } | { problem: LoadError } | null;

export default function App() {
  const [state, setState] = useState<State>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reading again keeps what is on screen until the new records arrive, so the map does not blink.
  const load = useCallback(() => {
    loadData().then(
      (sites) => setState({ sites }),
      (e) => setState({ problem: isLoadError(e) ? e : { kind: "other", message: String(e) } }),
    );
  }, []);

  // StrataField may have changed the records while this window was in the background.
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-base font-semibold">{text.appName}</h1>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw />{text.refresh}</Button>
      </header>
      <Body state={state} selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}

function Body({ state, selectedId, onSelect }: { state: State; selectedId: string | null; onSelect: (id: string | null) => void }) {
  if (!state) return <Message>{text.loading}</Message>;
  if ("problem" in state) {
    const p = state.problem;
    return <Message detail={p.kind === "other" ? p.message : undefined}>{text.problems[p.kind]}</Message>;
  }
  const { sites } = state;
  if (sites.length === 0) return <Message>{text.empty}</Message>;

  const shown = located(sites).length;
  // A borewell deleted in StrataField since it was selected is simply no longer selected.
  const selected = sites.find((s) => s.borewell.id === selectedId)?.borewell;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1"><SiteMap sites={sites} selectedId={selected?.id ?? null} onSelect={onSelect} /></div>
      <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l p-4 text-sm">
        <div>
          <p className="font-medium">{text.onMap(shown)}</p>
          {sites.length > shown && <p className="text-muted-foreground">{text.notShown(sites.length - shown)}</p>}
        </div>
        {selected ? (
          <div className="space-y-2 border-t pt-4">
            <h2 className="text-base font-semibold">{selected.borewellId}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{text.area}</dt><dd>{selected.area || text.notRecorded}</dd>
              <dt className="text-muted-foreground">{text.depth}</dt><dd>{selected.totalDepth != null ? `${selected.totalDepth} ${selected.depthUnit}` : text.notRecorded}</dd>
              <dt className="text-muted-foreground">{text.drilled}</dt><dd>{selected.date || text.notRecorded}</dd>
            </dl>
            <p className="text-muted-foreground">{text.openInStrataField}</p>
          </div>
        ) : (
          <p className="border-t pt-4 text-muted-foreground">{text.selectHint}</p>
        )}
      </aside>
    </div>
  );
}

function Message({ children, detail }: { children: string; detail?: string }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md text-center">
        <p className="text-base">{children}</p>
        {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

const isLoadError = (e: unknown): e is LoadError => typeof e === "object" && e !== null && "kind" in e;
