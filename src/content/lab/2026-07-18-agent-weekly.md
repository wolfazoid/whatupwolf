---
title: "Agent Weekly — week of 2026-07-18"
date: 2026-07-18T05:43
type: digest
status: done
tags: [agents, digest]
live: true
draft: false
summary: "Agent Weekly, July 11-18 2026: six verified items, led by Moonshot's 2.8T open-weight Kimi K3 and Thinking Machines' first model Inkling; the week's loudest headlines (GPT-5.6, the MCP spec RC) fall outside the window."
---

Week of **July 11–18, 2026** — 6 verified items, plus 2 also-noted.

A week defined by open weights. Two frontier-adjacent open models landed three days apart, from a Chinese lab and a US startup respectively, and a third squeezed a 27B-class multimodal model onto a phone. No US frontier lab shipped a flagship model inside the window.

## Top items

**Kimi K3 (Moonshot AI)** — 2.8T-parameter sparse MoE (896 experts, 16 active per token), 1M-token context, native vision, built on two new architectural pieces the lab calls Kimi Delta Attention and Attention Residuals. Available now via API at $3.00/$15.00 per 1M input/output tokens ($0.30 cached); full weights promised by July 27 with a technical report alongside. Why it matters: Artificial Analysis independently places it **#3 on its Intelligence Index at 57**, comparable to Opus 4.8 and GPT-5.5, and **#1 on AutomationBench-AA at 53%** — the strongest agentic showing yet from a model that will be openly weighted. It also used 132M output tokens to K2.6's 166M on the same eval suite, a 21% reduction, which matters directly for long agent runs. Moonshot's own post concedes a "noticeable gap in user experience" versus Fable 5 and GPT-5.6 Sol. · https://www.kimi.com/blog/kimi-k3 · independent eval: https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5

**Inkling (Thinking Machines Lab)** — The lab's first public model: 975B total / 41B active MoE, Apache 2.0, pretrained on 45T tokens of text, image, audio and video, with 1M context in the open-weights release (256K via API). Ships with a preview of Inkling-Small (276B total / 12B active). Why it matters: it scores **41 on the Artificial Analysis Intelligence Index — the leading US open-weights model**, past Nemotron 3 Ultra's 38 — and stands out specifically on agentic work at **1238 Elo on GDPval-AA v2**, ahead of Kimi K2.6 (1190) and DeepSeek v4 Flash (1189), while averaging 25K output tokens against 37–43K for other open-weights leaders. The lab is explicit that it is "not the strongest overall model available today" and positions it as a customization base rather than a finished product. Weights on Hugging Face; served by Together, Fireworks, Modal, Databricks, Baseten; runs on SGLang, vLLM, llama.cpp. · https://thinkingmachines.ai/news/introducing-inkling/ · independent eval: https://artificialanalysis.ai/articles/thinking-machines-has-released-inkling-the-new-leading-u-s-open-weights-model

**Bonsai 27B (PrismML)** — A multimodal model derived from Qwen3.6 27B using binary {−1,+1} weights with group-wise scaling, claimed at 1.125 effective bits per weight. The 1-bit variant is 3.9 GB. Apache 2.0. Why it matters: PrismML demonstrates multimodal agentic tasks running on an iPhone 17 Pro Max, and claims it as the first model of its capability class to run on a phone — the relevant threshold for on-device agents that hold tools and context locally. Claims are the vendor's own; no independent eval published yet. · https://prismml.com/news/bonsai-27b

**FLI AI Safety Index, Summer 2026** — Nine labs graded by seven outside reviewers across 37 indicators in six domains, on evidence collected through June 3. Anthropic leads at C+ (2.66), then OpenAI C (2.28) and Google DeepMind C (2.01); Meta D+ (1.32); Z.ai (0.88) and Alibaba Cloud (0.87) at D−; xAI (0.65), DeepSeek (0.47) and Mistral (0.33) failing. Why it matters: the top grade in the industry is a C+, and the report documents Anthropic, OpenAI, Google DeepMind and Meta all reversing prior bans on military applications between 2024 and 2026 — relevant to anyone choosing a model provider on governance criteria. · https://futureoflife.org/ai-safety-index-summer-2026/

**Agno v2.7.4** — Agent framework release on July 17 adding Superserve Tools for sandboxed execution, Plivo (SMS/voice), and Context Company observability; `agno create` gained interactive prompts and Azure/Helm/Modal/Render starter templates. Fixes cover team delivery for paused members, workflow session history limits, and Slack channel isolation. Why it matters: sandboxed execution and observability integrations are the unglamorous production plumbing agent frameworks have been thin on. (v2.7.3, July 14, also fell in-window: ValkeyDB store + vector search, Redmine tools.) · https://github.com/agno-agi/agno/releases

**Juggler v0.4.1** — Open-source GUI coding agent from the creator of JUCE, released July 17 and the week's most-upvoted agent tool on Hacker News (277 points). Tree-structured conversations with Miller-column navigation rather than linear chat, inspectable tool calls, and editable context. AGPLv3 core, Apache-2.0 extension SDK. Why it matters: a concrete argument that agent transcripts should be branchable and editable rather than append-only. · https://github.com/juggler-ai/juggler

## Also noted

- Anthropic launched **Claude for Teachers** (July 14), free for verified US K-12 educators, with an open-source teaching-skills repo on GitHub and published connector standards. · https://www.anthropic.com/news/claude-for-teachers
- Anthropic committed **$10M CAD to Canadian AI research** (July 14) across eight institutions including Amii, Mila and Vector, plus $5,000+ in API credits for affiliated startups. · https://www.anthropic.com/news/canadian-ai-research

## Excluded, and why

Several stories circulating this week as "this week's news" do not belong in the window:

- **GPT-5.6 (Sol/Terra/Luna)** and **Grok 4.5** both released publicly July 9 — two days before the window opened.
- **MCP spec 2026-07-28** — the release candidate locked May 21 and the Tier 1 SDK betas shipped June 29; the final spec publishes July 28. Nothing shipped July 11–18. It is the most consequential upcoming change for agent developers (stateless core, no initialize handshake, no session IDs), so it will be covered when it lands.
- **Gemini 3.5 Pro** — widely reported as targeting July 17, but Google has confirmed no date, context window, or pricing, and published nothing on the DeepMind blog. Every spec in circulation traces to leaks. Excluded as unverified.
- **Andrej Karpathy joining Anthropic** — real, but dated May 19, not July. Several aggregators misdated it into this week.
- **DeepSeek V4 stable** — scheduled July 24, still ahead.

Also excluded: a cluster of items ("Muse Spark 1.1", "AgentPrizm", "GPT-Live") that appear only on SEO content farms with no primary source, no vendor page, and mutually contradictory details. No verifiable original could be fetched for any of them.
