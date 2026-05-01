// Identification: 24F-0736
// app.js
'use strict';

const DIRS = [
    { dr: -1, dc:  0 },
    { dr:  1, dc:  0 },
    { dr:  0, dc: -1 },
    { dr:  0, dc:  1 },
];

let world = null;
let agent = null;
let kb    = null;

function createWorld(rows, cols) {
    const pits = new Set();

    const startSafe = new Set(
        getNeighbours(1, 1, rows, cols).map(([r, c]) => `${r},${c}`)
    );
    startSafe.add('1,1');

    const nonStart = [];
    for (let r = 1; r <= rows; r++)
        for (let c = 1; c <= cols; c++)
            if (!(r === 1 && c === 1))
                nonStart.push(`${r},${c}`);

    nonStart.forEach(k => {
        if (!startSafe.has(k) && Math.random() < 0.2) pits.add(k);
    });

    // FIX 1: Wumpus must never be placed in the start-safe zone
    const wumpusCandidates = shuffle(
        nonStart.filter(k => !pits.has(k) && !startSafe.has(k))
    );
    // Absolute fallback for pathologically small/pit-heavy grids
    const wumpus = wumpusCandidates.length > 0
        ? wumpusCandidates[0]
        : shuffle(nonStart.filter(k => !pits.has(k)))[0];

    // FIX 3: Gold must occupy a cell that has at least one non-pit neighbour
    // (prevents gold being sealed behind an impassable pit wall)
    const goldCandidates = shuffle(
        nonStart.filter(k => {
            if (pits.has(k) || k === wumpus || k === '1,1') return false;
            const [r, c] = k.split(',').map(Number);
            return getNeighbours(r, c, rows, cols)
                .some(([nr, nc]) => !pits.has(`${nr},${nc}`));
        })
    );
    // Hard fallback: any non-pit, non-wumpus cell
    const gold = goldCandidates.length > 0
        ? goldCandidates[0]
        : shuffle(nonStart.filter(k => !pits.has(k) && k !== wumpus && k !== '1,1'))[0];

    return { rows, cols, pits, wumpus, gold, wumpusAlive: true };
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getNeighbours(r, c, rows, cols) {
    return DIRS
        .map(({ dr, dc }) => [r + dr, c + dc])
        .filter(([nr, nc]) => nr >= 1 && nr <= rows && nc >= 1 && nc <= cols);
}

function hasBreezeAt(r, c, w) {
    return getNeighbours(r, c, w.rows, w.cols)
        .some(([nr, nc]) => w.pits.has(`${nr},${nc}`));
}

function hasStenchAt(r, c, w) {
    return w.wumpusAlive &&
        getNeighbours(r, c, w.rows, w.cols)
            .some(([nr, nc]) => w.wumpus === `${nr},${nc}`);
}

function createKB() {
    return { clauses: [], keySet: new Set(), steps: 0 };
}

const neg       = lit => lit.startsWith('-') ? lit.slice(1) : '-' + lit;
const clauseKey = clause => [...clause].sort().join('|');

function tell(kbObj, literals) {
    const c = new Set(literals);
    for (const l of c) if (c.has(neg(l))) return;
    const k = clauseKey(c);
    if (kbObj.keySet.has(k)) return;
    for (const e of kbObj.clauses)
        if ([...e].every(l => c.has(l))) return;
    kbObj.clauses = kbObj.clauses.filter(e => {
        const subsumed = [...c].every(l => e.has(l));
        if (subsumed) kbObj.keySet.delete(clauseKey(e));
        return !subsumed;
    });
    kbObj.clauses.push(c);
    kbObj.keySet.add(k);
}

function ask(kbObj, literal, maxSteps = 5000) {
    const seed = new Set([neg(literal)]);
    const sos  = [seed];
    const seen = new Set([clauseKey(seed)]);
    let steps  = 0;

    for (let i = 0; i < sos.length && steps < maxSteps; i++) {
        const c1 = sos[i];
        for (const lit of c1) {
            const comp = neg(lit);
            const pool = [...kbObj.clauses, ...sos];
            for (const c2 of pool) {
                if (!c2.has(comp)) continue;
                steps++;
                kbObj.steps++;
                const resolvent = new Set([...c1, ...c2]);
                resolvent.delete(lit);
                resolvent.delete(comp);
                if (resolvent.size === 0) return true;
                let taut = false;
                for (const l of resolvent) {
                    if (resolvent.has(neg(l))) { taut = true; break; }
                }
                if (taut) continue;
                const rk = clauseKey(resolvent);
                if (!seen.has(rk)) { seen.add(rk); sos.push(resolvent); }
                if (steps >= maxSteps) return false;
            }
        }
    }
    return false;
}

function tellPerceptAxioms(r, c, w, kbObj) {
    tell(kbObj, [`-P_${r}_${c}`]);
    tell(kbObj, [`-W_${r}_${c}`]);

    const nbrs = getNeighbours(r, c, w.rows, w.cols);
    const Br   = `B_${r}_${c}`;
    const Sr   = `S_${r}_${c}`;

    if (nbrs.length > 0) {
        tell(kbObj, [neg(Br), ...nbrs.map(([nr, nc]) => `P_${nr}_${nc}`)]);
        nbrs.forEach(([nr, nc]) => tell(kbObj, [neg(`P_${nr}_${nc}`), Br]));
        tell(kbObj, [neg(Sr), ...nbrs.map(([nr, nc]) => `W_${nr}_${nc}`)]);
        nbrs.forEach(([nr, nc]) => tell(kbObj, [neg(`W_${nr}_${nc}`), Sr]));
    }

    const breeze  = hasBreezeAt(r, c, w);
    const stench  = hasStenchAt(r, c, w);
    const glitter = (w.gold === `${r},${c}`);

    tell(kbObj, [breeze  ? Br  : neg(Br)]);
    tell(kbObj, [stench  ? Sr  : neg(Sr)]);

    return { breeze, stench, glitter };
}

function createAgent() {
    return {
        r: 1, c: 1,
        visited:     new Set(['1,1']),
        safe:        new Set(['1,1']),
        danger:      new Set(),
        goldFoundAt: null,
        path:        [],
        percepts:    ['None'],
        gameOver:    false,
        gameWon:     false,
        hasGold:     false,
        hasArrow:    true,
        stalled:     false,
    };
}

function inferAll(ag, w, kbObj) {
    for (let r = 1; r <= w.rows; r++) {
        for (let c = 1; c <= w.cols; c++) {
            const k = `${r},${c}`;
            if (ag.safe.has(k) || ag.danger.has(k)) continue;
            const noP = ask(kbObj, `-P_${r}_${c}`);
            const noW = ask(kbObj, `-W_${r}_${c}`);
            if (noP && noW) {
                ag.safe.add(k);
            } else {
                const hasP = ask(kbObj, `P_${r}_${c}`);
                const hasW = ask(kbObj, `W_${r}_${c}`);
                if (hasP || hasW) ag.danger.add(k);
            }
        }
    }
}

function bfsToTarget(ag, w, targetKey) {
    const startKey = `${ag.r},${ag.c}`;
    if (startKey === targetKey) return [];

    const queue = [{ r: ag.r, c: ag.c, path: [] }];
    const seen  = new Set([startKey]);

    while (queue.length > 0) {
        const { r, c, path } = queue.shift();
        for (const [nr, nc] of getNeighbours(r, c, w.rows, w.cols)) {
            const nk = `${nr},${nc}`;
            if (seen.has(nk) || !ag.safe.has(nk)) continue;
            seen.add(nk);
            const newPath = [...path, nk];
            if (nk === targetKey) return newPath;
            queue.push({ r: nr, c: nc, path: newPath });
        }
    }
    return [];
}

function planPath(ag, w) {
    if (ag.hasGold) {
        return bfsToTarget(ag, w, '1,1');
    }

    const unvisited = [...ag.safe].filter(k => !ag.visited.has(k));
    if (unvisited.length === 0) return [];

    const scored = unvisited.map(k => {
        const [r, c] = k.split(',').map(Number);
        const unknownCount = getNeighbours(r, c, w.rows, w.cols).filter(([nr, nc]) => {
            const nk = `${nr},${nc}`;
            return !ag.safe.has(nk) && !ag.danger.has(nk);
        }).length;
        return { k, score: unknownCount };
    });

    shuffle(scored);
    scored.sort((a, b) => b.score - a.score);

    for (const { k: targetKey } of scored) {
        const path = bfsToTarget(ag, w, targetKey);
        if (path.length > 0) return path;
    }
    return [];
}

// FIX 2: Speculative shooting — fires toward any danger cell in line when stalled with stench.
// On a miss, asserts -W for every cell along the arrow's path, feeding new facts into the KB.
function attemptShoot(ag, w, kbObj) {
    if (!ag.hasArrow) return false;

    let shootDir = null;

    // Priority 1: proven wumpus location in same column
    for (let r = 1; r <= w.rows; r++) {
        if (r === ag.r) continue;
        if (ask(kbObj, `W_${r}_${ag.c}`)) {
            shootDir = { dr: r > ag.r ? 1 : -1, dc: 0 };
            break;
        }
    }

    // Priority 2: proven wumpus location in same row
    if (!shootDir) {
        for (let c = 1; c <= w.cols; c++) {
            if (c === ag.c) continue;
            if (ask(kbObj, `W_${ag.r}_${c}`)) {
                shootDir = { dr: 0, dc: c > ag.c ? 1 : -1 };
                break;
            }
        }
    }

    // Priority 3: speculative — stench here, aim at the first danger cell in any direction
    if (!shootDir) {
        const hasStench = kbObj.clauses.some(
            cl => cl.size === 1 && [...cl][0] === `S_${ag.r}_${ag.c}`
        );
        if (hasStench) {
            outer:
            for (const { dr, dc } of DIRS) {
                let r = ag.r + dr, c = ag.c + dc;
                while (r >= 1 && r <= w.rows && c >= 1 && c <= w.cols) {
                    if (ag.danger.has(`${r},${c}`)) {
                        shootDir = { dr, dc };
                        break outer;
                    }
                    r += dr; c += dc;
                }
            }
        }
    }

    if (!shootDir) return false;

    ag.hasArrow = false;

    // Trace arrow and check for hit
    let ar = ag.r + shootDir.dr, ac = ag.c + shootDir.dc;
    let hit = false;
    while (ar >= 1 && ar <= w.rows && ac >= 1 && ac <= w.cols) {
        if (w.wumpusAlive && w.wumpus === `${ar},${ac}`) { hit = true; break; }
        ar += shootDir.dr;
        ac += shootDir.dc;
    }

    if (hit) {
        w.wumpusAlive = false;
        for (let r = 1; r <= w.rows; r++)
            for (let c = 1; c <= w.cols; c++)
                tell(kbObj, [`-W_${r}_${c}`]);
        // Cells only dangerous due to wumpus can now be cleared
        ag.danger = new Set([...ag.danger].filter(k => {
            const [r, c] = k.split(',').map(Number);
            return ask(kbObj, `P_${r}_${c}`);
        }));
        ag.percepts.push('Scream! Wumpus killed.');
    } else {
        // Assert wumpus is NOT in every cell the arrow passed through
        let r = ag.r + shootDir.dr, c = ag.c + shootDir.dc;
        while (r >= 1 && r <= w.rows && c >= 1 && c <= w.cols) {
            tell(kbObj, [`-W_${r}_${c}`]);
            r += shootDir.dr;
            c += shootDir.dc;
        }
        ag.percepts.push('Arrow missed.');
    }

    return true; // arrow was fired regardless of outcome
}

function formatPercepts({ breeze, stench, glitter }) {
    const list = [];
    if (breeze)  list.push('Breeze');
    if (stench)  list.push('Stench');
    if (glitter) list.push('Glitter');
    return list.length ? list : ['None'];
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

document.addEventListener('DOMContentLoaded', () => {

    const $ = id => document.getElementById(id);

    const DOM = {
        grid:        $('grid'),
        startBtn:    $('startBtn'),
        stepBtn:     $('stepBtn'),
        banner:      $('statusBanner'),
        posMetric:   $('posMetric'),
        percMetric:  $('perceptsMetric'),
        infMetric:   $('inferenceMetric'),
        kbMetric:    $('kbMetric'),
        goldStatus:  $('goldStatus'),
        arrowStatus: $('arrowStatus'),
        rowsInput:   $('gridRows'),
        colsInput:   $('gridCols'),
    };

    function render() {
        const { rows, cols } = world;
        DOM.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        DOM.grid.innerHTML = '';

        for (let r = rows; r >= 1; r--) {
            for (let c = 1; c <= cols; c++) {
                const key      = `${r},${c}`;
                const isAgent  = agent.r === r && agent.c === c;
                const reveal   = agent.visited.has(key);
                const isPit    = world.pits.has(key);
                const isWumpus = world.wumpus === key;

                const isHazard         = agent.danger.has(key) || (reveal && (isPit || isWumpus));
                const isDiscoveredGold = key === agent.goldFoundAt;

                const div = document.createElement('div');
                div.className = 'cell';

                if (isAgent) {
                    div.classList.add('agent');
                    if (agent.gameOver)     div.classList.add('dead');
                    else if (agent.gameWon) div.classList.add('won');
                } else if (isHazard) {
                    div.classList.add('danger');
                } else if (agent.visited.has(key)) {
                    div.classList.add('safe');
                }

                const lbl = document.createElement('span');
                lbl.className   = 'coord-label';
                lbl.textContent = `${c},${r}`;
                div.appendChild(lbl);

                let icon = '';
                if (isAgent) {
                    icon = agent.gameOver ? '💀' : (agent.gameWon ? '🏆' : 'A');
                } else if (reveal && isPit) {
                    icon = '🕳';
                } else if (reveal && isWumpus && world.wumpusAlive) {
                    icon = 'W';
                } else if (isDiscoveredGold) {
                    div.classList.add('gold');
                    icon = 'G';
                } else if (agent.danger.has(key)) {
                    icon = '✕';
                }

                if (icon) {
                    const span = document.createElement('span');
                    span.className   = 'cell-icon';
                    span.textContent = icon;
                    div.appendChild(span);
                }

                DOM.grid.appendChild(div);
            }
        }

        DOM.posMetric.textContent  = `(${agent.c}, ${agent.r})`;
        DOM.percMetric.textContent = agent.percepts.join(', ');
        DOM.infMetric.textContent  = kb.steps.toLocaleString();
        DOM.kbMetric.textContent   = kb.clauses.length;
        DOM.goldStatus.textContent = agent.hasGold
            ? (agent.gameWon ? '🏆 Safely extracted!' : '💰 Gold Collected! Returning...')
            : '';

        DOM.arrowStatus.textContent = agent.hasArrow ? '🏹 Arrow: Ready' : '🏹 Arrow: Used';
        DOM.arrowStatus.className   = agent.hasArrow ? 'arrow-status' : 'arrow-status used';

        const b = DOM.banner;
        b.className = 'status-banner';

        if (agent.gameOver) {
            b.classList.add('dead');
            b.textContent = `💀 Agent terminated — ${agent.percepts.join(', ')}`;
            DOM.stepBtn.disabled = true;
        } else if (agent.gameWon) {
            b.classList.add('win');
            b.textContent = '🏆 Objective complete — Climbed out with gold!';
            DOM.stepBtn.disabled = true;
        } else if (agent.stalled) {
            b.classList.add('stalled');
            b.textContent = '⚠ No provably safe moves remain — agent stalled.';
            DOM.stepBtn.disabled = true;
        } else {
            b.classList.add('hidden');
        }
    }

    DOM.startBtn.addEventListener('click', () => {
        const rows = clamp(parseInt(DOM.rowsInput.value) || 4, 3, 8);
        const cols = clamp(parseInt(DOM.colsInput.value) || 4, 3, 8);

        world = createWorld(rows, cols);
        agent = createAgent();
        kb    = createKB();

        const p = tellPerceptAxioms(1, 1, world, kb);
        agent.percepts = formatPercepts(p);
        inferAll(agent, world, kb);

        DOM.stepBtn.disabled = false;
        render();
    });

    DOM.stepBtn.addEventListener('click', () => {
        if (!world || agent.gameOver || agent.gameWon || agent.stalled) return;

        if (agent.path.length === 0) {
            agent.path = planPath(agent, world);

            if (agent.path.length === 0) {
                if (agent.hasArrow) {
                    // attemptShoot returns true whether hit OR miss (arrow was fired)
                    const shotFired = attemptShoot(agent, world, kb);
                    if (shotFired) {
                        inferAll(agent, world, kb);
                        agent.path = planPath(agent, world);
                        if (agent.path.length > 0) {
                            agent.stalled = false;
                            render();
                            return;
                        }
                    }
                }
                agent.stalled = true;
                render();
                return;
            }
        }

        const nextKey        = agent.path.shift();
        const [nr, nc]       = nextKey.split(',').map(Number);
        const isNewDiscovery = !agent.visited.has(nextKey);

        agent.r = nr;
        agent.c = nc;
        agent.visited.add(nextKey);

        if (world.pits.has(nextKey)) {
            agent.gameOver = true;
            agent.percepts = ['Fell into a Pit'];
        } else if (world.wumpus === nextKey && world.wumpusAlive) {
            agent.gameOver = true;
            agent.percepts = ['Eaten by the Wumpus'];
        } else {
            agent.safe.add(nextKey);

            const p = tellPerceptAxioms(nr, nc, world, kb);
            agent.percepts = formatPercepts(p);

            if (p.glitter && !agent.hasGold) {
                agent.hasGold     = true;
                agent.goldFoundAt = `${agent.r},${agent.c}`;
                agent.percepts    = ['Glitter ✨ — Gold found! Returning...'];
                agent.path        = [];
            }
        }

        if (agent.hasGold && agent.r === 1 && agent.c === 1) {
            agent.gameWon = true;
            agent.path    = [];
        }

        if (!agent.gameOver && !agent.gameWon) {
            inferAll(agent, world, kb);
        }

        if (isNewDiscovery && !agent.gameWon) {
            agent.path = [];
        }

        render();
    });

    DOM.startBtn.click();
});