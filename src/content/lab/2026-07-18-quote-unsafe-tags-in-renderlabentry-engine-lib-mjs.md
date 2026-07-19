---
title: "Quote unsafe tags in renderLabEntry (engine/lib.mjs)"
titleLevels:
  aware: "Quote YAML-unsafe tags"
  plain: "Stopped certain tag names breaking the site build"
date: 2026-07-18T02:49
type: experiment
status: done
tags: [engine, yaml-safety]
live: true
summary: "renderLabEntry now quotes numeric and YAML-reserved-word tags so they stay strings."
summaryLevels:
  aware: "Tags that are numbers or YAML keywords are now quoted, so they stay strings and cannot fail the build."
  plain: "A tag like 2026 or no could be misread by the site builder and break the build. They are now written in a way that cannot be misread."
---

The bare-tag path in yamlFlowScalar only escaped tags with special characters, so a purely-numeric tag like '2026' or a reserved word like true/false/null/yes/no/~ stayed bare and YAML parsed it as a number, boolean, or null — failing z.array(z.string()) at build time. I tightened the bare-safe test to additionally reject purely-numeric tokens and a case-insensitive reserved-word set, quoting anything unsafe. Added a unit test covering numeric, mixed-case reserved words, and ~; full suite (32 tests) and astro check both pass.
