import type { Model } from "@/lib/useModel";
import { matchedInWords, qualitySentences } from "@/model/quality";
import { howOften } from "@/model/words";
import { text } from "@/text";

/** How often the estimates are right, in plain words, and the borewells that do not fit their surroundings. */
export function QualityView({ model }: { model: Model | "failed" | null }) {
  const t = text.quality;
  const check = model && model !== "failed" ? model.check : null;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-8 text-sm">
        <h2 className="text-xl font-semibold">{text.howGood}</h2>
        {model === "failed" ? <p>{text.groundFailed}</p>
          : !check ? <p className="text-muted-foreground">{t.checking}</p>
          : !check.canJudge ? <p>{t.notEnough}</p>
          : (
            <>
              <ul className="space-y-2 text-base">
                {qualitySentences(check).map((sentence) => <li key={sentence}>{sentence}</li>)}
              </ul>
              <section className="space-y-2">
                <h3 className="text-base font-semibold">{t.oddTitle}</h3>
                {check.oddOnesOut.length === 0 ? <p className="text-muted-foreground">{t.oddNone}</p> : (
                  <>
                    <table className="w-full text-left">
                      <thead className="text-muted-foreground">
                        <tr><th className="py-1 pr-4 font-normal">{t.borewell}</th><th className="py-1 font-normal">{t.matched}</th></tr>
                      </thead>
                      <tbody>
                        {check.oddOnesOut.map((o) => (
                          <tr key={o.id} className="border-t">
                            <td className="py-1.5 pr-4 font-medium">{o.borewellId}</td>
                            <td className="py-1.5">{matchedInWords(o)} <span className="text-muted-foreground">({t.others(howOften(o.typical))})</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-muted-foreground">{t.oddNote}</p>
                  </>
                )}
              </section>
            </>
          )}
        <p className="border-t pt-4 text-muted-foreground">{t.fixed}</p>
      </div>
    </div>
  );
}
