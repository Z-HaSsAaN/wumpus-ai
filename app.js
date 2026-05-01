// Identification: 24F-0736
'use strict';

const DIRS = [
    { dr: -1, dc:  0 },
    { dr:  1, dc:  0 },
    { dr:  0, dc: -1 },
    { dr:  0, dc:  1 },
];

let world = null;
let agent = null;

// Environment Generation
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

    const preferred = shuffle(
        nonStart.filter(k => !pits.has(k) && !startSafe.has(k))
    );
    const fallback = shuffle(nonStart.filter(k => !pits.has(k) && k !== '1,1'));
    const pool = preferred.length >= 2 ? preferred : fallback;

    const wumpus = pool[0];
    const gold   = pool.length > 1 ? pool[1] : pool[0];

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

// Agent Initialization
function createAgent() {
    return {
        r: 1, c: 1,
        visited:  new Set(['1,1']),
        safe:     new Set(['1,1']),
        danger:   new Set(),
        goldFoundAt: null,
        path:     [],
        percepts: ['None'],
        gameOver: false,
        gameWon:  false,
        hasGold:  false,
        hasArrow: true, 
        stalled:  false,
    };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Main UI Controller
document.addEventListener('DOMContentLoaded', () => {

    const $ = id => document.getElementById(id);

    const DOM = {
        grid:       $('grid'),
        startBtn:   $('startBtn'),
        stepBtn:    $('stepBtn'),
        posMetric:  $('posMetric'),
        rowsInput:  $('gridRows'),
        colsInput:  $('gridCols'),
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

                const div = document.createElement('div');
                div.className = 'cell';

                if (isAgent) {
                    div.classList.add('agent');
                } else if (reveal) {
                    div.classList.add('safe');  
                }

                const lbl = document.createElement('span');
                lbl.className   = 'coord-label';
                lbl.textContent = `${c},${r}`;
                div.appendChild(lbl);

                let icon = '';
                if (isAgent) {
                    icon = 'A';
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
    }

    DOM.startBtn.addEventListener('click', () => {
        const rows = clamp(parseInt(DOM.rowsInput.value) || 4, 3, 8);
        const cols = clamp(parseInt(DOM.colsInput.value) || 4, 3, 8);

        world = createWorld(rows, cols);
        agent = createAgent();
        
        DOM.stepBtn.disabled = false;
        render();
        console.log("Iteration 2: World successfully generated.", world);
    });

    DOM.stepBtn.addEventListener('click', () => {
        alert("Environment rendering complete! Waiting for Iteration 3 (Logic Engine) to calculate moves.");
    });

    // Auto-start a grid on load
    DOM.startBtn.click();
});