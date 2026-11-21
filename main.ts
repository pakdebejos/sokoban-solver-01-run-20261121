// Room-split push-optimal Sokoban solver (variant B: A* over pushes, min-cost assignment heuristic).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_STATES = 600_000;
const DIRS: [number, number, string][] = [[0,-1,'u'],[0,1,'d'],[-1,0,'l'],[1,0,'r']];

type Level = { w: number; h: number; wall: Uint8Array; goals: number[]; boxes: number[]; player: number };

function parse(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = []; const boxes: number[] = []; let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]; const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if ('.*+'.includes(ch)) goals.push(i);
      if ('$*'.includes(ch)) boxes.push(i);
      if ('@+'.includes(ch)) player = i;
    }
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

// Squares from which a box can be pulled back onto some goal (reverse BFS).
function liveSquares(w: number, wall: Uint8Array, goals: number[]): Uint8Array {
  const live = new Uint8Array(wall.length);
  const q = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const x = q[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const y = x - d;
      if (!wall[y] && !wall[y - d] && !live[y]) { live[y] = 1; q.push(y); }
    }
  }
  return live;
}

// Flood fill from `from` avoiding walls/boxes; marks `seen` with `stamp`, returns lowest square reached.
function reach(w: number, wall: Uint8Array, occ: Uint8Array, from: number, seen: Int32Array, stamp: number, stack: Int32Array): number {
  let low = from, n = 0;
  stack[n++] = from; seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    const q0 = p - w, q1 = p + w, q2 = p - 1, q3 = p + 1;
    if (!wall[q0] && !occ[q0] && seen[q0] !== stamp) { seen[q0] = stamp; stack[n++] = q0; }
    if (!wall[q1] && !occ[q1] && seen[q1] !== stamp) { seen[q1] = stamp; stack[n++] = q1; }
    if (!wall[q2] && !occ[q2] && seen[q2] !== stamp) { seen[q2] = stamp; stack[n++] = q2; }
    if (!wall[q3] && !occ[q3] && seen[q3] !== stamp) { seen[q3] = stamp; stack[n++] = q3; }
  }
  return low;
}

// Frozen 2x2 block: a 2x2 of walls/boxes containing a box off its goal.
function frozen(w: number, wall: Uint8Array, occ: Uint8Array, goal: Uint8Array, t: number): boolean {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1, c = a + w, d = c + 1;
    if (!((wall[a] || occ[a]) && (wall[b] || occ[b]) && (wall[c] || occ[c]) && (wall[d] || occ[d]))) continue;
    if ((occ[a] && !goal[a]) || (occ[b] && !goal[b]) || (occ[c] && !goal[c]) || (occ[d] && !goal[d])) return true;
  }
  return false;
}

// Shortest player walk from `from` to `to` avoiding walls/boxes (BFS, DIRS order tie-break).
function walkTo(w: number, wall: Uint8Array, occ: Uint8Array, from: number, to: number): string | null {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array<string>(wall.length);
  const q = [from]; prev[from] = from;
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi];
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const qq = p + dy * w + dx;
      if (wall[qq] || occ[qq] || prev[qq] !== -1) continue;
      prev[qq] = p; how[qq] = letter; q.push(qq);
    }
  }
  if (prev[to] === -1) return null;
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

function boxesKey(boxes: number[], size: number): number {
  let k = 0;
  for (const b of boxes) k = k * size + b;
  return k;
}


// Binary min-heap on [f, g, stateIdx].
function heapPush(heap: [number, number, number][], e: [number, number, number]): void {
  let i = heap.length; heap.push(e);
  while (i > 0) { const p = (i - 1) >> 1;
    if (heap[i][0] > heap[p][0] || (heap[i][0] === heap[p][0] && heap[i][1] >= heap[p][1])) break;
    [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
}
function heapPop(heap: [number, number, number][]): [number, number, number] {
  const top = heap[0]; const last = heap.pop()!;
  if (heap.length > 0) { heap[0] = last;
    for (let i = 0; ; ) { let c = 2 * i + 1;
      if (c >= heap.length) break;
      if (c + 1 < heap.length && (heap[c + 1][0] < heap[c][0] || (heap[c + 1][0] === heap[c][0] && heap[c + 1][1] < heap[c][1]))) c++;
      if (heap[c][0] > heap[i][0] || (heap[c][0] === heap[i][0] && heap[c][1] >= heap[i][1])) break;
      [heap[i], heap[c]] = [heap[c], heap[i]]; i = c; } }
  return top;
}

// Grid BFS distances from one goal over open floor (ignoring boxes).
function goalDist(w: number, wall: Uint8Array, goal: number): Int32Array {
  const d = new Int32Array(wall.length).fill(-1);
  const q = [goal]; d[goal] = 0;
  for (let qi = 0; qi < q.length; qi++) { const p = q[qi];
    for (const [dx, dy] of DIRS) { const qq = p + dy * w + dx;
      if (!wall[qq] && d[qq] === -1) { d[qq] = d[p] + 1; q.push(qq); } } }
  return d;
}

// Min-cost assignment of boxes to goals (brute-force permutations, n <= 4): admissible push lower bound.
function assignH(boxes: number[], dists: Int32Array[]): number {
  const n = boxes.length;
  const idx = [...Array(n).keys()];
  let best = Infinity;
  const perm = (a: number[], k: number): void => {
    if (k === n) { let s = 0; for (let i = 0; i < n; i++) { const dd = dists[a[i]][boxes[i]]; if (dd < 0) return; s += dd; } if (s < best) best = s; return; }
    for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; }
  };
  perm(idx, 0);
  return best;
}

// Push-A* for one room (sub-level walls already include other rooms' boxes as walls).
// Returns {pushes, moves} or null. Budget counts enqueued states.
function solveRoom(lv: Level, roomBoxes: number[], roomGoals: number[], startPlayer: number, extraWall: Uint8Array): { pushes: number; moves: string } | null {
  const { w } = lv;
  const size = lv.wall.length;
  const wall = new Uint8Array(size);
  for (let i = 0; i < size; i++) wall[i] = lv.wall[i] | extraWall[i];
  const goal = new Uint8Array(size);
  for (const g of roomGoals) goal[g] = 1;
  const live = liveSquares(w, wall, roomGoals);
  const occ = new Uint8Array(size);
  const seen = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const solved = (bs: number[]) => bs.every((b) => goal[b]);
  if (roomBoxes.some((b) => !live[b])) return null;
  const boxes0 = roomBoxes.slice().sort((a, b) => a - b);
  const dists = roomGoals.map((g) => goalDist(w, wall, g));
  const sBoxes: number[][] = [boxes0];
  const sPlayer: number[] = [startPlayer];
  const sG: number[] = [0];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const bestG = new Map<number, number>();
  for (const b of boxes0) occ[b] = 1;
  const low0 = reach(w, wall, occ, startPlayer, seen, ++stamp, stack);
  for (const b of boxes0) occ[b] = 0;
  bestG.set(boxesKey(boxes0, size) * size + startPlayer, 0);
  const expanded = new Map<number, number>();
  expanded.set(boxesKey(boxes0, size) * size + low0, 0);
  const h0 = assignH(boxes0, dists);
  if (!Number.isFinite(h0)) return null;
  const heap: [number, number, number][] = [[h0, 0, 0]];
  let found = solved(boxes0) ? 0 : -1;
  while (heap.length > 0 && found < 0) {
    const [, g, head] = heapPop(heap);
    if (g !== sG[head]) continue;
    const boxes = sBoxes[head];
    for (const b of boxes) occ[b] = 1;
    const low = reach(w, wall, occ, sPlayer[head], seen, ++stamp, stack);
    const here = stamp;
    const ek = boxesKey(boxes, size) * size + low;
    const eg = expanded.get(ek);
    if (eg !== undefined && eg < g) { for (const x of boxes) occ[x] = 0; continue; }
    expanded.set(ek, g);
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi];
      for (const [dx, dy] of DIRS) {
        const d = dy * w + dx;
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occ[t] || !live[t]) continue;
        occ[b] = 0; occ[t] = 1;
        const fr = frozen(w, wall, occ, goal, t);
        occ[t] = 0; occ[b] = 1;
        if (fr) continue;
        const nb = boxes.slice(); nb[bi] = t; nb.sort((a, b2) => a - b2);
        const k = boxesKey(nb, size) * size + b;
        const prevG = bestG.get(k);
        if (prevG !== undefined && prevG <= g + 1) continue;
        const h = assignH(nb, dists);
        if (!Number.isFinite(h)) continue;
        if (sBoxes.length >= MAX_STATES) { for (const x of boxes) occ[x] = 0; return null; }
        bestG.set(k, g + 1);
        sBoxes.push(nb); sPlayer.push(b); sG.push(g + 1); parent.push(head); pushFrom.push(b); pushTo.push(t);
        if (solved(nb)) { found = sBoxes.length - 1; break; }
        heapPush(heap, [g + 1 + h, g + 1, sBoxes.length - 1]);
      }
    }
    for (const x of boxes) occ[x] = 0;
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let player = startPlayer;
  let boxes = boxes0;
  for (const s of path) {
    const from = pushFrom[s], to = pushTo[s];
    const d = to - from;
    const dir = DIRS.find(([dx, dy]) => dy * w + dx === d)!;
    for (const b of boxes) occ[b] = 1;
    const walk = walkTo(w, wall, occ, player, from - d);
    for (const b of boxes) occ[b] = 0;
    if (walk === null) return null;
    moves += walk + dir[2];
    player = from;
    boxes = sBoxes[s];
  }
  return { pushes: path.length, moves };
}

// Split the level into rooms: cut the hallway row's dead floor, components holding boxes are rooms.
function roomsOf(lv: Level): { boxes: number[]; goals: number[] }[] | null {
  const { w, wall, goals, boxes, player } = lv;
  const live = liveSquares(w, wall, goals);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: { squares: number[]; boxes: number[]; goals: number[] }[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s]; part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i] + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) { part[q] = rooms.length; squares.push(q); }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0).map((r) => ({ boxes: r.boxes, goals: r.goals }));
}

function solve(text: string): string {
  const lv = parse(text);
  const rooms = roomsOf(lv);
  if (rooms === null) {
    // Whole-level fallback: one push-BFS over everything.
    const extra = new Uint8Array(lv.wall.length);
    const r = solveRoom(lv, lv.boxes, lv.goals, lv.player, extra);
    return r ? r.moves : '';
  }
  let player = lv.player;
  let moves = '';
  const done: boolean[] = rooms.map(() => false);
  for (let ri = 0; ri < rooms.length; ri++) {
    const room = rooms[ri];
    const extra = new Uint8Array(lv.wall.length);
    for (let oj = 0; oj < rooms.length; oj++) {
      if (oj === ri) continue;
      for (const b of done[oj] ? rooms[oj].goals : rooms[oj].boxes) extra[b] = 1;
    }
    const r = solveRoom(lv, room.boxes, room.goals, player, extra);
    if (r === null) return '';
    moves += r.moves;
    // advance player to end of this room's moves
    for (const ch of r.moves) player += ch === 'u' ? -lv.w : ch === 'd' ? lv.w : ch === 'l' ? -1 : 1;
    done[ri] = true;
  }
  return moves;
}

for (const id of readdirSync(I).sort()) {
  const moves = solve(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
