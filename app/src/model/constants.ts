/**
 * Every number the model uses, in one place. These are starting values: they are adjusted once
 * against the real records using the accuracy check (check.ts), with the aim that a step the model
 * calls "likely" is right at least 7 times in 10.
 */
import type { RecordQuality } from "@strata/core";

/** The column is answered in steps this thick, in feet. */
export const STEP_FT = 5;

/** Borewells further than this from a point say nothing about it. */
export const RADIUS_KM = 5;

/** At most this many borewells vote on a step: the nearest ones that reach it. */
export const MAX_VOTERS = 12;

/** At most this many of those come from one spot (borewells within `SAME_SITE_KM` of each other). */
export const MAX_PER_SITE = 3;

/** A borewell closer than this counts as this far away, so one at the very spot is not infinitely loud. */
export const MIN_DISTANCE_KM = 0.025;

/** Borewells this close together are one site: they share a vote and count once for confidence. */
export const SAME_SITE_KM = 0.1;

/** How much a borewell's vote counts, by how good its record is. */
export const QUALITY_WEIGHT: Record<RecordQuality, number> = { good: 1, fair: 0.7, unknown: 0.7, poor: 0.4 };

/** A borewell placed by looking up its address is only roughly where the map says. */
export const ADDRESS_WEIGHT = 0.5;

/** "Likely": a borewell this near, at least this many separate sites, and this much agreement. */
export const LIKELY = { nearestKm: 1, sites: 3, share: 0.6 };

/** "Rough guess": a borewell this near and at least this many separate sites. */
export const ROUGH = { nearestKm: 3, sites: 2 };

/** With fewer borewells than this to compare, the accuracy check says it cannot judge. */
export const MIN_BOREWELLS_TO_JUDGE = 10;

/**
 * A borewell is an odd one out when it matches its surroundings less than this fraction as often as
 * is typical at that distance from the nearest other site, judged on at least this many steps and
 * against at least this many borewells.
 */
export const ODD = { fraction: 0.5, minSteps: 10, minBorewells: 5 };
