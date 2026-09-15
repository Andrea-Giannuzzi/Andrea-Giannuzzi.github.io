# Graph Report - Andrea-Giannuzzi.github.io  (2026-09-15)

## Corpus Check
- 75 files · ~51,743 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 419 nodes · 612 edges · 55 communities (30 shown, 24 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.82)
- Token cost: unmeasured for host-agent semantic extraction; local AST and clustering used no external LLM calls.

## Graph Freshness
- Built from commit: `73ad8594`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- black-hole-physics.js
- black-hole-simulator.js
- Kerr–Newman Black Hole Simulator 2D
- Academic Portfolio architecture and maintenance
- black-hole-3d.js
- main.js
- General Relativity Notes
- Scalar vacuum polarization and the electric-field response in de Sitter space
- Mass, Charge, and Angular Momentum: From Einstein-Maxwell to the Kerr-Newman Metric
- black-hole-simulation.js
- black-hole-simulation.test.cjs
- black-hole-local.test.cjs
- black-hole-lensing-disk.test.cjs
- Academic CV
- package.json
- Scientific Notes library
- Extraction of the Order-e0 Contribution to the Scalar Function F_phi
- Analytical Mechanics PDF Placeholder README
- Numerical Methods (Note)
- Analytical Mechanics | Notes
- Computational Physics | Notes
- Expanding Universe | Notes
- Elettromagnetismo | Notes
- From Maxwell to the Electromagnetic Field Tensor | Notes
- Spacetime Geometry | Notes
- Mathematical Methods | Notes
- Mathematical Physics | Notes
- Derivate simboliche in Python | Projects
- MIRA | Projects
- Pendolo semplice non lineare | Projects
- Lagrangian Mechanics detail mount [data-note-detail="lagrangian-mechanics"]
- Numerical Methods detail mount [data-note-detail="numerical-methods"]
- Cosmology subject mount [data-subject-notes="cosmology"]
- Cosmology Subject Page
- Electromagnetism subject mount [data-subject-notes="electromagnetism"]
- General Relativity subject mount [data-subject-notes="general-relativity"]
- Differential Geometry detail mount [data-note-detail="differential-geometry"]
- Differential Geometry (Note)
- Mathematical Methods for Physics Notes
- Fourier Series detail mount [data-note-detail="fourier-series"]
- Lambda-CDM project mount [data-project-detail="lambda-cdm"]
- Pendulum project mount [data-project-detail="pendolo-piccole-oscillazioni"]
- Second Brain Agent Ecosystem project mount [data-project-detail="secondbrain-agent-ecosystem"]
- Profile Photo
- Images Assets README
- Cosmology PDF Placeholder
- Electromagnetism Subject Page
- Electromagnetism PDF Note
- Electromagnetism Notes README
- General Relativity Subject Page
- General Relativity PDF Placeholder
- General Relativity Notes README
- Mathematical Methods Notes README
- Mathematical Physics PDF Placeholder README

## God Nodes (most connected - your core abstractions)
1. `Academic Portfolio architecture and maintenance` - 21 edges
2. `content()` - 19 edges
3. `runScientificValidation()` - 16 edges
4. `Kerr–Newman Black Hole Simulator 2D` - 14 edges
5. `bindEvents()` - 13 edges
6. `initialize()` - 13 edges
7. `updateGeometry()` - 13 edges
8. `getContent()` - 12 edges
9. `setLanguage()` - 12 edges
10. `getBasePath()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Parametric Sidebar Prototype (mass/charge/spin form driving visual scale, no real physics integration)` --semantically_similar_to--> `Stationary Kerr-Newman Metric Assumption`  [INFERRED] [semantically similar]
  Codex.context-Blackholesimulator/3D-Simulator_Logic_idea.html → docs/binary-merger-feasibility.md
- `Fourier Series Article Redirect` --semantically_similar_to--> `Blog Redirect to Notes`  [INFERRED] [semantically similar]
  articles/fourier-series.html → blog.html
- `3D Simulator Good Graphic (Codex context prototype)` --semantically_similar_to--> `Black Hole 3D Simulator Page`  [INFERRED] [semantically similar]
  Codex.context-Blackholesimulator/3D-Simulator_Good_Graphic.html → black-hole-simulator-3d.html
- `3D Simulator Logic Idea (Codex context prototype)` --semantically_similar_to--> `Black Hole 3D Simulator Page`  [INFERRED] [semantically similar]
  Codex.context-Blackholesimulator/3D-Simulator_Logic_idea.html → black-hole-simulator-3d.html
- `Geodesic Equation` --semantically_similar_to--> `Kerr-Newman Geodesics`  [INFERRED] [semantically similar]
  notes/general-relativity/pdf/relativity.pdf → assets/kerr-newman-metric-theoretical-background.pdf

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three Feasibility Paths for Binary Black Hole Merger Feature** — docs_binary_merger_feasibility, concept_full_numerical_relativity_path, concept_post_newtonian_path, concept_visual_nonphysical_merger_path, concept_real_physics_validation_principle [EXTRACTED 0.95]
- **Kerr-Newman Stationary Metric Physics Functions** — func_black_hole_physics_metric, func_black_hole_physics_metric_derivatives, func_black_hole_physics_christoffel_symbols, func_black_hole_physics_geodesic_right_hand_side, func_black_hole_physics_integrate_geodesic [EXTRACTED 0.95]
- **Covariant Electromagnetism Construction** — notes_electromagnetism_pdf_from_maxwell_to_the_electromagnetic_field_tensor_four_current, notes_electromagnetism_pdf_from_maxwell_to_the_electromagnetic_field_tensor_electromagnetic_field_tensor, notes_electromagnetism_pdf_from_maxwell_to_the_electromagnetic_field_tensor_covariant_maxwell_equations, notes_electromagnetism_pdf_from_maxwell_to_the_electromagnetic_field_tensor_relativistic_lorentz_force [EXTRACTED 1.00]
- **Kerr-Newman Metric Derivation Chain** — assets_kerr_newman_metric_theoretical_background_einstein_maxwell_system, assets_kerr_newman_metric_theoretical_background_reissner_nordstrom_metric, assets_kerr_newman_metric_theoretical_background_boyer_lindquist_coordinates, assets_kerr_newman_metric_theoretical_background_kerr_newman_metric [EXTRACTED 1.00]
- **Site Physics Notes Curriculum** — notes_general_relativity_pdf_relativity, notes_electromagnetism_pdf_electromagnetism, notes_analytical_mechanics_pdf_analytical_mechanics, notes_cosmology_pdf_cosmology, notes_mathematical_methods_pdf_mathematical_methods_for_physics [INFERRED 0.75]
- **Shared Note Detail Page Template** — notes_computational_physics_numerical_methods_note, notes_mathematical_methods_differential_geometry_note [INFERRED 0.85]

## Communities (55 total, 24 thin omitted)

### Community 0 - "black-hole-physics.js"
Cohesion: 0.11
Nodes (39): addScaled(), checkCoordinateState(), christoffelSymbols(), circularOrbitFourVelocity(), circularOrbitInformation(), classifySpacetime(), computeLensingTable(), conservedQuantities() (+31 more)

### Community 1 - "black-hole-simulator.js"
Cohesion: 0.15
Nodes (39): applyPreset(), bindEvents(), cacheElements(), content(), drawCircle(), formatInput(), formatMatrix(), formatValidationNumber() (+31 more)

### Community 2 - "Kerr–Newman Black Hole Simulator 2D"
Cohesion: 0.06
Nodes (27): Black Hole 3D Simulator Page, Eight-component state with equatorial initial conditions, Equatorial geodesic canvas [data-geodesic-canvas], Neutral test-particle geodesics without Lorentz force, Selected trajectory diagnostics [data-numerical-checks], Boyer–Lindquist solver stop near outer horizon, Kerr–Newman Black Hole Simulator 2D, Fixed-step classical Runge–Kutta fourth-order integration (+19 more)

### Community 3 - "Academic Portfolio architecture and maintenance"
Cohesion: 0.07
Nodes (33): https://github.com/Andrea-Giannuzzi, mailto:an.giannuzzi@studenti.unina.it, mailto:andreagiannuzzi921@gmail.com, Contact page, data-featured-project=, data-featured-research=de-sitter-scalar-vacuum-polarization, data-featured-research=order-e0-scalar-function-f-phi, black-hole-simulator.html (+25 more)

### Community 4 - "black-hole-3d.js"
Cohesion: 0.15
Nodes (30): angularDeflectionFor(), animate(), applyLensing(), buildDecorativeDisk(), buildDisk(), buildErgosphere(), buildPhotonSphere(), buildPlungingRegion() (+22 more)

### Community 5 - "main.js"
Cohesion: 0.18
Nodes (23): academicDistinctionsMarkup(), academicFactsMarkup(), courseworkMarkup(), getBasePath(), getContent(), getNestedValue(), getSharedDocument(), localizedAcademicValue() (+15 more)

### Community 6 - "General Relativity Notes"
Cohesion: 0.10
Nodes (22): Andrea Giannuzzi CV, Carter Constant and Separability, Kerr-Newman Geodesics, Analytical Mechanics Notes, Hamiltonian Mechanics and Canonical Transformations, Lagrangian Mechanics, Cosmology Notes, Cosmic Distance Ladder (Parallax, Cepheids, Supernovae) (+14 more)

### Community 7 - "Scalar vacuum polarization and the electric-field response in de Sitter space"
Cohesion: 0.10
Nodes (21): Dimensional regularization of scalar-loop counterterm, Finite local Maxwell renormalization freedom, Proper-time heat-kernel ultraviolet counterterm, The local scalar-loop counterterm in de Sitter space, Classical constant electric fields and the Schwinger effect in de Sitter — arXiv:2508.14973v2, Bunch–Davies scalar mode normalization, Closed-time-path components and contact equations, Invariant hypergeometric scalar two-point distribution (+13 more)

### Community 8 - "Mass, Charge, and Angular Momentum: From Einstein-Maxwell to the Kerr-Newman Metric"
Cohesion: 0.16
Nodes (15): Mass, Charge, and Angular Momentum: From Einstein-Maxwell to the Kerr-Newman Metric, ADM Mass, Boyer-Lindquist Coordinates, Coupled Einstein-Maxwell System, Ergoregion and Frame Dragging, Kerr-Newman Metric, Penrose Process (Negative Energy Extraction), Reissner-Nordström Metric (+7 more)

### Community 9 - "black-hole-simulation.js"
Cohesion: 0.31
Nodes (10): invalid(), load(), load3DTransfer(), prepare(), presetConfiguration(), run(), save(), toLocalConfiguration() (+2 more)

### Community 10 - "black-hole-simulation.test.cjs"
Cohesion: 0.14
Nodes (12): assert, context, fs, impossible, inside, memory, naked, path (+4 more)

### Community 11 - "black-hole-local.test.cjs"
Cohesion: 0.17
Nodes (9): assert, context, fs, kerr, local, path, records, test (+1 more)

### Community 12 - "black-hole-lensing-disk.test.cjs"
Cohesion: 0.20
Nodes (8): assert, context, fs, kerr, path, schwarzschild, test, vm

### Community 13 - "Academic CV"
Cohesion: 0.22
Nodes (9): CV Assets README, Academic distinctions [data-academic-distinctions], CV education overview [data-academic-overview="cv"], All coursework [data-coursework="all"], CV selected projects [data-cv-projects], CV research experience [data-cv-research], Technical skills [data-skills="technical"], Academic CV (+1 more)

### Community 14 - "package.json"
Cohesion: 0.33
Nodes (5): name, private, scripts, dev, test

### Community 15 - "Scientific Notes library"
Cohesion: 0.67
Nodes (4): Fourier Series Article Redirect, Blog Redirect to Notes, Notes subject grid [data-note-subjects], Scientific Notes library

### Community 16 - "Extraction of the Order-e0 Contribution to the Scalar Function F_phi"
Cohesion: 0.67
Nodes (4): Extraction of the Order-e0 Contribution to the Scalar Function F_phi, Digamma Function Reflection Identity, Pauli-Villars Regularized Scalar Current, Scalar Function F_phi

### Community 17 - "Analytical Mechanics PDF Placeholder README"
Cohesion: 0.50
Nodes (4): Lagrangian Mechanics Note Detail Page, Analytical Mechanics PDF Placeholder README, Analytical Mechanics Notes README, Computational Physics Notes README

### Community 18 - "Numerical Methods (Note)"
Cohesion: 0.50
Nodes (4): Numerical Methods (Note), Computational Physics PDF Placeholder, Fourier Series (Note), Mathematical Physics Notes README

### Community 19 - "Analytical Mechanics | Notes"
Cohesion: 0.67
Nodes (3): data-subject-notes=analytical-mechanics, Analytical Mechanics | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 20 - "Computational Physics | Notes"
Cohesion: 0.67
Nodes (3): data-subject-notes=computational-physics, Computational Physics | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 21 - "Expanding Universe | Notes"
Cohesion: 0.67
Nodes (3): data-note-detail=expanding-universe, Expanding Universe | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 22 - "Elettromagnetismo | Notes"
Cohesion: 0.67
Nodes (3): data-note-detail=electromagnetism-notes, Elettromagnetismo | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 23 - "From Maxwell to the Electromagnetic Field Tensor | Notes"
Cohesion: 0.67
Nodes (3): data-note-detail=maxwell-electromagnetic-field-tensor, From Maxwell to the Electromagnetic Field Tensor | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 24 - "Spacetime Geometry | Notes"
Cohesion: 0.67
Nodes (3): data-note-detail=spacetime-geometry, Spacetime Geometry | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 25 - "Mathematical Methods | Notes"
Cohesion: 0.67
Nodes (3): data-subject-notes=mathematical-methods, Mathematical Methods | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 26 - "Mathematical Physics | Notes"
Cohesion: 0.67
Nodes (3): data-subject-notes=mathematical-physics, Mathematical Physics | Notes, PORTFOLIO_BASE_PATH = ../../

### Community 27 - "Derivate simboliche in Python | Projects"
Cohesion: 0.67
Nodes (3): data-project-detail=derivate-simboliche, Derivate simboliche in Python | Projects, PORTFOLIO_BASE_PATH = ../

### Community 28 - "MIRA | Projects"
Cohesion: 0.67
Nodes (3): data-project-detail=mira, MIRA | Projects, PORTFOLIO_BASE_PATH = ../

### Community 29 - "Pendolo semplice non lineare | Projects"
Cohesion: 0.67
Nodes (3): data-project-detail=pendolo-semplice-numerico, Pendolo semplice non lineare | Projects, PORTFOLIO_BASE_PATH = ../

## Knowledge Gaps
- **174 isolated node(s):** `assert`, `context`, `fs`, `impossible`, `inside` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 197 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Mass, Charge, and Angular Momentum: From Einstein-Maxwell to the Kerr-Newman Metric` connect `Mass, Charge, and Angular Momentum: From Einstein-Maxwell to the Kerr-Newman Metric` to `General Relativity Notes`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `assert`, `context`, `fs` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `black-hole-physics.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10963455149501661 - nodes in this community are weakly interconnected._
- **Should `Kerr–Newman Black Hole Simulator 2D` be split into smaller, more focused modules?**
  _Cohesion score 0.06417112299465241 - nodes in this community are weakly interconnected._
- **Should `Academic Portfolio architecture and maintenance` be split into smaller, more focused modules?**
  _Cohesion score 0.06818181818181818 - nodes in this community are weakly interconnected._
- **Should `black-hole-3d.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14623655913978495 - nodes in this community are weakly interconnected._
- **Should `General Relativity Notes` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._