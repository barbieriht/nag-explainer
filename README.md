# NAG Explainer

An interactive, in-browser explainer of Neural Architecture Generation (NAG):
designing neural networks by sampling from a learned generative model instead
of searching for one architecture per task. Every demo runs live in the
browser; there is no backend, no build step and no network request at
runtime. Built as part of ongoing PhD research in AI at the University of
São Paulo (USP), and based on the paper *From Search to Synthesis: A
Systematic Mapping Study of Neural Architecture Generation* (Barbieri,
Alcobaça & de Carvalho; under review).

## What is inside

- **Search: the NAS view.** The search space / strategy / evaluation triad, the
  bi-level objective, and a toy cell space (15,625 cells) to explore.
- **From search to generation.** The target p*(A) ∝ exp(βR(A)), computed
  exactly over the whole space. Slide β and watch it collapse to the NAS answer.
- **Amortization.** A NAS loop (regularized evolution, 300 evaluations) against
  a task-conditioned generator trained once on 16 tasks (4,800 evaluations)
  that proposes 20 architectures for a new task. The honest cost chart shows
  the generator only pays off after about 17 new tasks.
- **Three pillars.** Representation, mechanism, guidance, with four mechanism
  mini-demos: latent optimization, discrete diffusion with predictor guidance,
  GFlowNet vs reinforcement learning, and budget-conditioned (Pareto)
  generation.
- **Evaluating a generator, open problems, references.** Every citation
  resolves to a real entry of the author's bibliography.

## The toy world

All demos share `assets/js/space.js`: a NAS-Bench-201-style cell (4 nodes, 6
edges, 5 operations). The accuracies are a **hand-designed synthetic function,
not NAS-Bench-201 data**. It depends on a task descriptor (difficulty, input
resolution), so there is a family of related tasks. The space is small enough
to enumerate, so every distribution a demo shows is exact.

Each mechanism demo illustrates a principle and is not a reimplementation of
the cited methods:

| Demo | Core | What it shows |
|---|---|---|
| Latent optimization | `latent.js` | many-to-one decoding, degenerate regions, predictor ≠ truth |
| Diffusion | `diffusion.js` | exact denoiser memorizes (novelty 0); per-edge denoiser generalizes; guidance trades diversity for accuracy |
| GFlowNet vs RL | `flow.js` | trajectory balance matches p ∝ R; REINFORCE collapses to one cell |
| Budget-conditioned | `pareto.js`, `generator.js` | one generator for every budget, against the exact Pareto front |

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Tests

```sh
node --test
```

Node 18+ and no dependencies. The tests check each claim the page makes:
amortization beats random sampling on held-out tasks, the GFlowNet approaches
its target while RL collapses, the exact denoiser memorizes, guidance raises
accuracy, latent decoding is exact, and the Pareto front is non-dominated.
They also check the literature data, that the generated page content is up to
date, and that the two language versions have the same structure.

## Content pipeline

```sh
# 1. Import the references the pages cite from the author's .bib
node scripts/import-literature.js "/path/to/Overleaf Project/sn-bibliography.bib"

# 2. Fill the citations and references of index.html and index.pt.html
node scripts/build-page.js          # rewrite
node scripts/build-page.js --check  # fail if out of date (also a test)
```

- Cite with `<a class="cite" href="#id" data-cite="id"></a>`, where `id` is
  a key of the .bib. After adding a citation, re-run step 1, then step 2.
- Only the entries the pages cite are exported to
  `assets/data/literature.json`, with bibliographic fields only. The rest of
  the bibliography stays private (a test checks this).
- `content/bib-notes.json` lists .bib keys that point to the wrong paper
  (none at the moment). The build refuses to cite them until they are fixed.
- Prose is hand-written in both pages; `assets/js/i18n.js` holds the strings
  the demos generate at runtime.

The page structure, collapsible sections, theme and citation tooling are
adapted from [fwi-explainer](https://github.com/barbieriht/fwi-explainer).

## Developed with Claude Code

This repository was developed with the assistance of
[Claude Code](https://claude.com/claude-code), Anthropic's AI coding agent,
under the author's direction and review.

## Credits

- No figure, table or text is reproduced from the paper. Every visual is
  computed in the browser.
- Cell diagram and chart colors were checked with a colorblind-safety
  validator. Operations are also labeled in text, so identity never depends
  on color alone.

## Third-party code

Vendored in `assets/vendor/` with their licenses:

- [D3](https://d3js.org) v7.9.0 — ISC
- [KaTeX](https://katex.org) v0.16.47 — MIT

## License

MIT — see [LICENSE](LICENSE).
