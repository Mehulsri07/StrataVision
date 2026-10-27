import { useState } from "react";
import type { Rates } from "@/model/drilling";

const KEY = "stratavision.rates";
const NONE: Rates = { drillPerFt: null, plainPerFt: null, slottedPerFt: null };

/**
 * DWO's rates, kept on this computer only (StrataVision never writes to StrataField's records).
 * If they cannot be stored they last until StrataVision is closed.
 */
export function useRates(): [Rates, (r: Rates) => void] {
  const [rates, setRates] = useState<Rates>(() => {
    try {
      return { ...NONE, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return NONE;
    }
  });
  const save = (r: Rates) => {
    setRates(r);
    try {
      localStorage.setItem(KEY, JSON.stringify(r));
    } catch {
      // Kept for this session only.
    }
  };
  return [rates, save];
}
