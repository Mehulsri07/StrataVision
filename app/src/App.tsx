import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadData, recordsSavedAt, type LoadError, type Records } from "@/lib/api";
import { useModel } from "@/lib/useModel";
import { text } from "@/text";
import { MapView } from "@/views/MapView";
import { QualityView } from "@/views/QualityView";
import { SectionView } from "@/views/SectionView";
import { CityView } from "@/views/CityView";

/** How often to look whether StrataField has saved. */
const CHECK_EVERY_MS = 3000;

type State = { records: Records; as: string } | { problem: LoadError } | null;
type View = "map" | "section" | "city" | "quality";

export default function App() {
  const [state, setState] = useState<State>(null);
  const [view, setView] = useState<View>("map");
  // A screen's map is first drawn when it is first shown: a map set up while hidden has no size to
  // fit the borewells to. (The city map is also worked out only then.)
  const [seen, setSeen] = useState<ReadonlySet<View>>(new Set(["map"]));
  if (!seen.has(view)) setSeen(new Set([...seen, view]));

  // Reading again keeps what is on screen until the new records arrive, so the map does not blink.
  // Records that turn out unchanged are kept as they are, so nothing is worked out again for them.
  const load = useCallback(() => {
    loadData().then(
      (records) => {
        const as = JSON.stringify(records);
        setState((before) => (before && "records" in before && before.as === as ? before : { records, as }));
      },
      (e) => setState({ problem: isLoadError(e) ? e : { kind: "other", message: String(e) } }),
    );
  }, []);

  // StrataField may have changed the records while this window was in the background.
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  // And while it shows, StrataField may save beside it: checked every few seconds, read only when saved.
  useEffect(() => {
    let last: number | null = null;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      recordsSavedAt().then((at) => {
        if (last != null && at !== last) load();
        last = at;
      }, () => {});
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [load]);

  const records = state && "records" in state && state.records.sites.length > 0 ? state.records : null;
  const model = useModel(records);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-6 border-b px-4 py-2">
        <h1 className="text-base font-semibold">{text.appName}</h1>
        {records && (
          <nav className="flex gap-1">
            {(["map", "section", "city", "quality"] as const).map((v) => (
              <Button key={v} variant={view === v ? "secondary" : "ghost"} size="sm" aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>
                {text.tabs[v]}
              </Button>
            ))}
          </nav>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={load}><RefreshCw />{text.refresh}</Button>
      </header>
      {!state ? <Message>{text.loading}</Message>
        : "problem" in state ? <Message detail={state.problem.kind === "other" ? state.problem.message : undefined}>{text.problems[state.problem.kind]}</Message>
        : !records ? <Message>{text.empty}</Message>
        : (
          <>
            {/* The maps stay mounted behind the other screens, so they keep their place, the picked spot and the line. */}
            <div className={view === "map" ? "flex min-h-0 flex-1" : "hidden"}><MapView records={records} model={model} onHowGood={() => setView("quality")} /></div>
            {seen.has("section") && <div className={view === "section" ? "flex min-h-0 flex-1" : "hidden"}><SectionView records={records} model={model} onHowGood={() => setView("quality")} /></div>}
            {seen.has("city") && <div className={view === "city" ? "flex min-h-0 flex-1" : "hidden"}><CityView records={records} model={model} onHowGood={() => setView("quality")} /></div>}
            {view === "quality" && <QualityView model={model} />}
          </>
        )}
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
