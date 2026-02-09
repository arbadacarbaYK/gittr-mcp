# Self-evolving / “nervous system” ideas for agents

References and habits so the bot improves itself all the time without changing model weights. Use these when you do reflection or review rhythm.

## Useful links (GitHub / papers)

- **AgentEvolver (self-evolving agent system)**  
  - Paper: [arXiv:2511.10395 – AgentEvolver: Towards Efficient Self-Evolving Agent System](https://arxiv.org/abs/2511.10395)  
  - Code: [modelscope/AgentEvolver](https://github.com/modelscope/AgentEvolver) (Apache-2.0)  
  - Ideas: **self-questioning** (generate own tasks, no handcrafted datasets), **self-navigating** (reuse experience to guide exploration), **self-attributing** (credit assignment — what actually helped). Designed for RL/training; we use the same ideas at the **prompt + memory** level.

- **Self-modifying / self-referential weights** (weight modification): The repo formerly at `DRawson5570/self-modifying-lora` (AI modifies its own LoRA weights) no longer exists at that URL. For the same idea in research code: [IDSIA/modern-srwm](https://github.com/IDSIA/modern-srwm) (ICML 2022 — self-referential weight matrix). Different stack (fine-tuning), not drop-in for OpenClaw.

- **SatOpsHQ** is already “self-improving” in the sense of writing skills and using tools; we reinforce that with reflection, memory, and the habits below.

## Three habits (for this workspace)

Translated from AgentEvolver so the bot can “grow up” and act more autarkic and proactive using **only** read/write/exec and existing HEARTBEAT slots:

1. **Self-questioning (generate your own next tasks)**  
   In a reflection or gittr-mcp/reflection slot: read HEARTBEAT.md and TOOLS.md, then **write** 1–3 concrete “tasks I could try that I haven’t done yet” to `memory/YYYY-MM-DD.md` or a line in `memory/reflections.md` (e.g. “Next: try Moltverr apply for X”, “Next: read gittr-mcp issue #N”). Next rotation, when you pick a task, consider these self-generated options as well as the fixed slots. So you’re not only reacting to the list — you’re proposing what to do next.

2. **Self-navigating (reuse experience)**  
   Before choosing what to do this turn: **read** `memory/reflections.md` and `memory/surf-bookmarks.md` (and today’s `memory/YYYY-MM-DD.md` if it exists). Use that to guide the next action — e.g. “last time Moltbook engagement worked well” or “bookmarked link X, surf it this time.” So past learnings and bookmarks actually steer the next move.

3. **Self-attributing (note what worked / didn’t)**  
   After doing a slot or a task: **append** one short line to `memory/reflections.md` or `memory/YYYY-MM-DD.md` with what worked or didn’t (e.g. “Moltbook post got 2 zaps — do more of that”; “session_status failed — gateway was down”). Over time this becomes a trace of what’s worth repeating and what to avoid. That’s “credit assignment” at the level of actions, not weights.

## Where this is wired

- HEARTBEAT.md “Self-evolving habits” paragraph tells the bot to do these three things during reflection and when choosing/after doing slots.
- This file is for the human and the bot: read it during “review rhythm” or when you want to deepen self-improvement behavior.
