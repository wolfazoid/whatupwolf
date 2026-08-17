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
  // `selfCheck` appends the engine self-check section to the digest body — the
  // count of best-effort failures swallowed into the gitignored engine/cycle.log
  // since the previous digest (see engine/log-scan.mjs). Agent Weekly carries it
  // because it is the recurring artefact that reliably leaves the box.
  'agent-weekly': { kind: 'digest', type: 'digest', titlePrefix: 'Agent Weekly', cadence: 'week of', selfCheck: true },
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
  // One-shot: run by hand, not on cron. The infra counterpart to the sprint
  // above — that one asked "what's worth prototyping", this asks "what would it
  // take to host the ones that need a server". Also `type: briefing`, so the
  // ranked options land as a draft and Wolf reviews them before any infra
  // decision is made.
  'app-subdomain': { kind: 'digest', type: 'briefing', titlePrefix: 'App Subdomain' },
  // The recurring counterpart to the one-shot sprint above: a lighter monthly
  // sweep that keeps the interaction landscape fresh once the survey has run.
  // Renders as `type: digest` — a factual machine-log post, so it publishes direct.
  'interaction-lab': { kind: 'digest', type: 'digest', titlePrefix: 'Interaction Lab' },
};
