# StrataVision: More Maps (Phase 8)

Two more modes on the City map, on the same grid of about 10,000 squares.

## Water-bearing sand down to a depth

- A depth slider, as for "Ground at a depth".
- Colour: how many feet of water-bearing sand the model proposes from the surface down to that
  depth (every proposed water-bearing step counts 5 ft), light where little, dark where much.
- Strong where every step down to the depth has a proposal and every water-bearing one is likely;
  pale where any is a rough guess or any step has no proposal (a gap could hide sand).
- Clear where more than half the steps down to the depth have no proposal (not enough data), or
  where the column ends before the depth.

## How fast the water level is changing

Feet per year that the water gets deeper (falling) or shallower (rising), in a red–blue scale
from −5 to +5 ft a year.

Readings: each borewell's dated water readings with the level at rest (static), and its own water
level and date too unless a reading of that day already gives it. Undated levels are left out.

At each square, within 2 km:

1. **Measured at the same borewells** (strong colour): borewells with at least two readings a year
   or more apart each give their own change per year. The water rises by tens of feet after the
   monsoon and falls again by May, so only pairs of readings at the same time of year (within 45
   days on the calendar) are compared, and their changes per year averaged. Where any are within
   2 km, the square shows their average, nearer ones counting more (1/d², distances under 100 m
   counted as 100 m).
2. **The same borewells at different times of year** (pale colour): otherwise, borewells whose
   repeat readings are all in different seasons give the straight line through their readings,
   averaged the same way. Rough: the seasonal swing is in it.
3. **From different borewells over the years** (pale colour): otherwise, if at least 15 readings
   within 2 km span at least 2 years, the straight line through all of them by date. Rough: it
   compares different wells, which differ by tens of feet for reasons other than time; with fewer
   readings that difference would show as a strong trend (a simulation with no change at all gave
   ±5 ft a year or more on most squares with 5 readings).
4. Otherwise clear.

The key says which is which, and the panel says how many borewells have repeat readings, so it
is clear the strong colour fills in as DWO records more readings in StrataField.

Today's records: 67 water levels from 2022 to 2026 and one repeat reading, so the map is mostly
clear for now.

StrataField today overwrites a borewell's drilling-time water level when the first later reading
is added, so that first comparison is lost; StrataField should keep it as a reading (separate fix).

## Tests

Thickness counted and capped at the depth; rough and none rules. Change per year: a line through
known readings; under a year apart ignored; same-season pairs compared, mixed seasons only as a fallback; same-borewell trends preferred to the area trend;
nearer counts more; fewer than 15 readings or under 2 years gives nothing; undated readings ignored.
