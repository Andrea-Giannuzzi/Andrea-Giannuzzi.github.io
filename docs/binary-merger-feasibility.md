# Binary black hole mergers: feasibility assessment

This document evaluates how hard it would be to add a binary black hole merger
visualization to this simulator. It does not propose an implementation and no
code accompanies it — this is a scoping analysis to support a go/no-go
decision.

## What the current physics layer actually is

Every function in `assets/js/black-hole-physics.js` — `metric`,
`metricDerivatives`, `christoffelSymbols`, `geodesicRightHandSide`,
`integrateGeodesic` — is built around a single, **stationary** Kerr-Newman
solution: one fixed `{M, a, q}` triple, a metric that does not depend on
time, and no notion of a second mass anywhere in the tensor construction. A
binary system is not a small parameter addition on top of this. It is a
qualitatively different kind of spacetime: non-stationary in general (it
loses energy to gravitational radiation as the two bodies spiral inward),
generally non-axisymmetric, and — during the merger itself — not expressible
in closed form at all. None of the existing machinery (the metric, the
Christoffel-symbol contraction, the RK4 geodesic integrator) carries over to
this without a wholesale redesign of the tensor layer that computes it.

## Three paths, and why each is hard or dishonest in a different way

**(a) Full numerical relativity.** This is how gravitational-wave source
modeling is actually done: solve Einstein's field equations on a dynamical,
merging spacetime, discretized on a 3+1 spatial grid with adaptive mesh
refinement, constraint-preserving evolution schemes, and singularity-avoiding
gauge choices. It is a multi-person, multi-year research-software effort even
in optimized C++/Fortran on HPC clusters. There is no meaningful "smaller
version" of this that stays physically honest — it is categorically out of
scope for a browser-based JavaScript project.

**(b) Post-Newtonian (PN) approximation for the inspiral phase.** This is a
real, tractable-in-principle middle ground. A PN expansion gives an
approximate two-body metric and an orbital-decay trajectory (via the
gravitational-wave energy-loss / quadrupole formula) that is implementable in
JavaScript — but at an effort comparable to, or larger than, the existing
Kerr-Newman module: a genuinely new physics component (new metric
construction, new trajectory equations, a new validation suite checked
against known PN analytical results), reusing only basic tensor-algebra
utilities (`inverseMetric` and similar) from the current code, nothing else.
Critically, **PN approximations break down as the two horizons approach
merger** — exactly the moment a viewer would most want to see. Even a
successful PN implementation could only honestly render the early-to-mid
inspiral, not the merger and ringdown, without either switching to numerical
relativity data (not computable in-browser) or falling back to (c) for the
final phase.

**(c) A purely visual, non-physical approximation.** Blend or morph two
black-hole visuals together along a hand-authored trajectory, with no
merging-spacetime geodesics actually being solved. This is comparatively
cheap to build — on the order of the existing 3D renderer's own scope, new
mesh/particle choreography rather than new tensor math — but it would be
**the first feature in this codebase that is purely illustrative with no
underlying solved equations**. Every other feature here — the RK4
convergence tests, the analytical-comparison validation suite in
`runScientificValidation()`, the conserved-quantity drift checks — exists
specifically to demonstrate the simulator computes real physics rather than
approximating an effect visually. Even the disk and the lensing table, which
are approximations, are approximations *of quantities the solver actually
computes* (a real ISCO, a real backward-integrated deflection), not fabricated
trajectories. A morph-based merger would cross that line and would need a
disclaimer as prominent as the one already carried by the disk/starfield
before this session's changes.

## Recommendation

Do not implement this feature unless a labeled, explicitly non-physical
inspiral animation (path c) is what is actually wanted, with that framing
accepted up front — it is a scope trade-off, not a minor addition, because it
would be the first thing in this codebase that visually claims to show
something the underlying solver cannot compute.

If physical fidelity is the goal, the only tractable path is (b), PN
inspiral-only — and that remains a substantial, standalone project (a new
metric layer, a new validation suite, new UI) that would not reuse the
merger's presentation layer even if built, and would still need an honest
"merger and ringdown are not modeled" disclaimer, since PN fails precisely
where the visualization would otherwise be most dramatic.
