// The experiment registry. Each experiment names a prompt file
// (engine/experiments/<name>.md), its `kind` (which pipeline runs it), the Lab
// entry `type` its report renders as, and the human-facing title prefix. A
// monitor also names the `target` its probe audits. Deliberately a small literal,
// not a framework — we extract a general runner only once 2–3 experiments exist
// to shape it (YAGNI).
//
// `cadence` is the optional word the run date is introduced by in the title
// ("Agent Weekly — week of 2026-07-20"). It exists because the title template
// used to hardcode "week of", which reads wrong for anything that isn't weekly:
// a one-shot sprint omits it and titles as "<prefix> — <date>".
export const EXPERIMENTS = {
  'agent-weekly': { kind: 'digest', type: 'digest', titlePrefix: 'Agent Weekly', cadence: 'week of' },
  'site-health': {
    kind: 'monitor',
    type: 'monitor',
    titlePrefix: 'Site Health',
    cadence: 'week of',
    target: 'https://whatupwolf.com',
  },
  // One-shot: run by hand, not on cron. Renders as `type: briefing`, which
  // draftForType() gates behind draft:true — Wolf's review of the ranked
  // prototype shortlist IS the publishing gate.
  'interaction-landscape': { kind: 'digest', type: 'briefing', titlePrefix: 'Interaction Landscape' },
  // The recurring counterpart to the one-shot sprint above: a lighter monthly
  // sweep that keeps the interaction landscape fresh once the survey has run.
  // Renders as `type: digest` — a factual machine-log post, so it publishes direct.
  'interaction-lab': { kind: 'digest', type: 'digest', titlePrefix: 'Interaction Lab' },
};
