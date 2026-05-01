# Wumpus World — KB Agent (Logic Module v2.8)

A web-based artificial intelligence agent that navigates the classic "Wumpus World" environment using **Propositional Logic** and **Set-of-Support Resolution Refutation**.

**🔗 [Play the Live Demo on Vercel](https://wumpus-ai.vercel.app/)** 
**🎥 [Watch the Video Breakdown on LinkedIn](https://www.linkedin.com/posts/muhammad-hassaan-16b012254_i-recently-completed-an-artificial-intelligence-ugcPost-7455865935304794112-AVWP)**

---

## 🧠 The AI Logic Engine
Unlike simple reactive agents, this Knowledge Base (KB) Agent relies entirely on mathematical proof to guarantee safety, falling back to calculated speculation only when mathematically stalled.

* **Percept Axioms:** The agent perceives Breezes and Stenches and translates them into biconditional logic (e.g., $B_{2,1} \iff P_{1,1} \lor P_{2,2} \lor P_{3,1}$).
* **CNF Conversion:** All percepts are strictly translated into Conjunctive Normal Form (CNF) clauses and added to the Knowledge Base.
* **Resolution Refutation:** Before entering any unvisited cell, the agent uses a **Set-of-Support Resolution Refutation** algorithm. It attempts to derive a contradiction by asking the KB $Ask(\neg P_{r,c})$ and $Ask(\neg W_{r,c})$.
* **Absolute Safety First:** A cell is only entered if the algorithm mathematically proves it is safe.

## 🎯 Features
* **Dynamic Grid Generation:** Configurable from 3x3 up to 8x8 grids. The environment generator guarantees the start zone is safe and that gold is never completely walled off by pits.
* **Smart & Speculative Shooting:** The agent will shoot its arrow if it has mathematically deduced the exact coordinates of the Wumpus. If stalled by stench without a proven target, it will fire speculatively down the most likely vector. Arrow misses generate negative assertions ($-W$) to feed new facts back into the KB.
* **Live Telemetry:** Tracks the agent's current position, active percepts, total KB clauses, and inference resolution steps in real-time.
* **BFS Pathfinding:** Uses Breadth-First Search to navigate back through known-safe nodes after discovering gold or avoiding stalled states.

## 🛠️ Tech Stack
* **Frontend:** HTML5, CSS3 (Vanilla)
* **Logic Engine:** JavaScript (ES6+)
* **Deployment:** Vercel

## 👨‍💻 Author
**Name:** Muhammad Hassaan
**Identification:** 24F-0736 
**GitHub:** [@Z-HaSsAaN](https://github.com/Z-HaSsAaN)
