/** All wording shown to users, in one place. Plain language: users are not technical. */
export const text = {
  appName: "StrataVision",
  loading: "Reading your borewell records…",
  refresh: "Refresh",

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

  selectHint: "Click a borewell on the map to see it here.",
  area: "Area",
  depth: "Depth",
  drilled: "Drilled",
  notRecorded: "Not recorded",
  openInStrataField: "To see everything about this borewell or change it, open it in StrataField.",
};
