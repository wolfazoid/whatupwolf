---
title: "Revamp the Lab page filter UX (src/components/LabFilter.tsx + its use…"
date: 2026-07-19T15:33
type: experiment
status: done
tags: [engine, lab-ux]
live: true
draft: false
summary: "Replaced the Lab page's per-tag button row with a search box plus tag/type dropdowns, backed by a unit-tested pure filter module."
---

The per-tag chip row grew one button per tag and no longer fit the page, so the filter state was widened from a single active tag to a {tag, type, search} query and the controls became a text input plus two native selects. The filtering logic was extracted to src/lib/lab-filter.ts as pure functions — facet tallies (ranked by frequency, count shown in each option label), AND-ed multi-term search over title and summary, and an active-filter description — which made it testable under the existing vitest setup without adding a DOM library; src/components/LabFilter.tsx is now just the presentational shell. Accessibility comes from native selects with associated labels, a type=search input, and an aria-live result count so keystroke results are announced rather than purely visual. Added 14 tests in src/lib/lab-filter.test.ts; one initially failed because the fixture's summary contained the word being asserted absent, which was a fixture bug rather than a code bug and was corrected. npm test (133 passed), npm run check (0 errors) and npm run build (32 pages) all pass.
