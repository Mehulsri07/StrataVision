# StrataVision: More Maps (Phase 8)

Two more modes on the City map, on the same grid of about 10,000 squares.

## Water-bearing sand down to a depth

- A depth slider, as for "Ground at a depth".
- Colour: how many feet of water-bearing sand the model proposes from the surface down to that
  depth (every proposed water-bearing step counts 5 ft), light where little, dark where much.
- Strong where every step counted is likely; pale where any is a rough guess.
- Clear where more than half the steps down to the depth have no proposal (not enough data), or
  where the column ends before the depth.

## How fast the water level is changing

Feet per year that the water gets deeper (falling) or shallower (rising), in a red–blue scale
from −5 to +5 ft a year.

Readings: each borewell's dated water readings (static level); a borewell with none counts its
own water level and its date as one reading. Undated levels are left out.

At each square, within 2 km:

1. **Measured at the same borewells** (strong colour): borewells with at least two readings a year
   or more apart each give their own change per year (the straight line through their readings).
   Where any are within 2 km, the square shows their average, nearer ones counting more (1/d²,
   distances under 100 m counted as 100 m).
2. **From different borewells over the years** (pale colour): otherwise, if at least 5 readings
   within 2 km span at least 2 years, the straight line through all of them by date. Rough: it
   compares different wells, which can differ for reasons other than time.
3. Otherwise clear.

The key says which is which, and the panel says how many borewells have repeat readings, so it
is clear the strong colour fills in as DWO records more readings in StrataField.

Today's records: 67 water levels from 2022 to 2026 and one repeat reading, so the map is almost
all pale for now.

## Tests

Thickness counted and capped at the depth; rough and none rules. Change per year: a line through
known readings; under a year apart ignored; same-borewell trends preferred to the area trend;
nearer counts more; fewer than 5 readings or under 2 years gives nothing; undated readings ignored.
