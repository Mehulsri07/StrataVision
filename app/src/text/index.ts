/** All wording shown to users, in one place. Plain language: users are not technical. */
export const text = {
  appName: "StrataVision",
  loading: "Reading your borewell records…",
  refresh: "Refresh",
  tabs: { map: "Map", quality: "Data quality" },

  /** Why the records could not be shown, by the kind of problem the Rust side reports. */
  problems: {
    noDatabase: "No borewell records were found on this computer. Install StrataField and add borewells first.",
    newer: "Your records were saved by a newer StrataField than this StrataVision understands. Update StrataVision to open them.",
    older: "Your records need a one-time upgrade. Update StrataField, open it once, then come back and press Refresh.",
    other: "The records could not be read.",
  },
  empty: "There are no borewells yet. Add some in StrataField.",

  onMap: (n: number) => (n === 1 ? "1 borewell on the map" : `${n} borewells on the map`),
  notShown: (m: number) => (m === 1 ? "1 without a location is not shown" : `${m} without a location are not shown`),

  /** The four kinds of ground the proposals are made in. */
  groups: { clay: "Clay", fineSand: "Fine sand", waterBearing: "Water-bearing sand", hard: "Hard ground" },
  /** How sure a proposal is. */
  levels: { likely: "Likely", rough: "Rough guess", none: "Not enough data" },
  levelMeaning: {
    likely: "Likely: several borewells close by agree.",
    rough: "Rough guess: the borewells are further away, few, or disagree.",
    none: "Not enough data: nothing is proposed.",
  },

  pickHint: "Click a borewell to see what was recorded there, or anywhere else on the map to see what the ground is probably like.",
  area: "Area",
  depth: "Depth",
  drilled: "Drilled",
  notRecorded: "Not recorded",
  recordedLayers: "Recorded layers",
  noLayers: "No layers were recorded for this borewell.",
  openInStrataField: "To see everything about this borewell or change it, open it in StrataField.",

  proposedHere: "Proposed layers here",
  readingGround: "Reading ground heights…",
  groundFailed: "The ground heights could not be read, so layers cannot be proposed.",
  notEnoughHere: "There are not enough borewells near this spot to say anything.",
  fromBorewells: (n: number, nearest: string) => (n === 1 ? `From 1 borewell, ${nearest} away` : `From ${n} borewells, nearest ${nearest}`),
  noGroundHere: "The ground height is not known at this spot, so layers cannot be proposed here.",
  waterExpected: (feet: number, nearest: string, since: string) =>
    `Water level expected about ${feet} ft below ground (nearest reading ${nearest} away; levels measured since ${since})`,
  noWater: "No recent water level within 1 km",
  /** On the drawings. An expected level is worked out; a measured one was read off at the borewell. */
  waterExpectedShort: (feet: number) => `Water expected about ${feet} ft`,
  waterMeasured: (feet: number, year: string | null) => (year ? `Water ${feet} ft (measured ${year})` : `Water ${feet} ft (date not recorded)`),
  atThisSpot: (n: number) => `${n} borewells are at this spot:`,
  clickLayer: "Click a layer to see which borewells it comes from.",
  depths: (top: number, bottom: number) => `${top} to ${bottom} ft below ground`,
  blockLabel: (name: string, level: string, top: number, bottom: number) => `${name}, ${level.toLowerCase()}, ${top} to ${bottom} feet`,
  workedOutFrom: "Worked out from",
  andMore: (k: number) => `and ${k} more`,
  howGood: "How good are these estimates?",

  quality: {
    checking: "Checking…",
    notEnough: "There are not enough borewells with layers and a location to check yet (at least 10 are needed).",
    checked: (n: number) => `Checked against ${n} borewells: each was hidden in turn and worked out from the others.`,
    likely: (often: string) => `Where it says Likely, it was right ${often}.`,
    rough: (often: string) => `Where it says Rough guess, it was right ${often}.`,
    under1: (often: string) => `With another borewell within 1 km, the best guess was right ${often}.`,
    from1to3: (often: string) => `With the nearest borewell 1 to 3 km away, ${often}.`,
    over3: (often: string) => `With the nearest borewell more than 3 km away, ${often}.`,
    oddTitle: "Borewells that do not fit their surroundings",
    oddNone: "None found.",
    oddNote: "These are worth a look in StrataField: most often a slip in typing or a pin in the wrong place.",
    borewell: "Borewell",
    matched: "Matched its surroundings",
    matchedFeet: (right: number, of: number) => `${right} of ${of} ft`,
    others: (often: string) => `others like it matched ${often}`,
    fixed: "These are proposals worked out from past drilling. They are not measurements.",
  },
};
