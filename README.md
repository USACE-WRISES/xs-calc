# 1D Cross-Section Hydraulics Calculator

A single‑page web app that computes 1D open‑channel hydraulics for a single cross‑section using Manning’s equation. Load `main.html` in a modern browser, define your cross‑section geometry and roughness, and the app computes discharge and other key metrics (or, if you specify discharge, it solves for the stage/depth that conveys it).

## Capabilities

- Unit systems: US (ft, s) or SI (m, s) with appropriate constants (`k=1.486` for US, `k=1.0` for SI).
- Inputs: bed/energy slope S, roughness (Manning’s n) for Left Overbank (LOB), Main Channel, Right Overbank; flow depth D; optional “Specify Discharge” mode to solve for stage from Q.
- Cross‑section editor: station–elevation table with per‑point stage tags (LB/RB) and optional per‑point n; insert/delete rows; sort by station; keyboard navigation and type‑to‑edit.
- Compound channel setup: mark exactly one Left Bank (LB) and one Right Bank (RB) to partition into LOB, Channel, ROB.
- Horizontal Variation of n (HVn): assign n by station with carry‑forward between explicit n‑breaks. Channel portion uses either segmented n or a composite n when either bank slope is steeper than 5H:1V and multiple n values exist.
- n‑value picker: quick catalog with MIN/TYP/MAX anchors and search across categories (Main Channels, Floodplains, Mountain Streams, Excavated/Dredged, Lined/Constructed).
- Hydraulic Controls & Structures (HCS):
  - Ineffective Flow Areas (left/right station, effective‑above elevation, permanent flag).
  - Obstructions (left/right station, top elevation).
  - Levees (left/right enable, station, crest elevation) with levee‑based clipping of effective flow width.
- Results summary: XS average and per‑zone (LOB/Channel/ROB) metrics including Q, n used, V, wetted perimeter P, area A, hydraulic radius R, top width T, average/max depth, boundary shear τ, unit stream power p, and Froude number.
- Conveyance reporting: table of conveyance by n‑breaks when HVn is ON, including per‑segment A, P, R, K and totals (K_L, K_C, K_R, K_total).
- Flow distribution: slice LOB/Channel/ROB into user‑selected counts (total ≤ 45 for HEC‑RAS parity) and compute per‑slice Q, A, P, percent conveyance, hydraulic depth, velocity, shear, and unit power.
- Plots: interactive cross‑section with water fill, optional overlays of depth‑averaged Velocity and Shear (XS average or per‑slice), visible n‑segments, and graphics for IFAs, obstructions, and levees.
- Quality‑of‑life: reset example, harmonized action button widths, info tooltips, and a Help modal summarizing formulas and usage.

## How to Use

1. Open `main.html` in a modern desktop browser.
2. Enter station–elevation points; mark one LB and one RB row; optionally set per‑point n (HVn).
3. Choose units, slope S, and either provide depth D (to compute Q) or enable “Specify Discharge” to enter Q (to solve for stage/depth).
4. Adjust LOB/Channel/ROB n values or use the n‑picker. Configure slices and any HCS (IFAs, obstructions, levees).
5. Review the Results, Conveyance, Distribution tables, and plot. Use the plot mode toggle to view XS‑average or per‑slice Velocity/Shear.

## Notes

- Computations follow Manning’s equation K = (k/n)·A·R^(2/3), Q = K·√S. Units, γ, and g constants are handled per the selected unit system.
- The flow distribution slicer caps total slices at 45 to mirror common HEC‑RAS practices.
- The Help modal (“?”) in the app lists equations and additional guidance.

