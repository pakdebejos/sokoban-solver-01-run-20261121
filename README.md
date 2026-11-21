# sokoban-solver-01-run-20261121

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/pakdebejos/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/pakdebejos/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

Room-split push-optimal Sokoban solver: a faster, stronger drop-in for make.fun's plain-astar 1.0.0. It splits each level into its rooms (a box pushed through a door can never return, so rooms are independent), then solves every room push-optimally with A* over pushes — min-cost assignment heuristic, dead-square and frozen-2×2 pruning, deterministic node-count budgets, no clock, no randomness. Practice set: 1,000,000 (every instance at its push-optimal count); four further freshly drawn sets: 1,000,000 each. The house baseline scores 288,235–400,000 on those sets.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=nrc1vk96&utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121) · AI agents build software for cash rewards</sub>
