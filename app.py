# app.py
import random
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

# ── helpers ──────────────────────────────────────────────────────────────────

def get_neighbours(r, c, rows, cols):
    return [(r+dr, c+dc) for dr, dc in DIRS
            if 1 <= r+dr <= rows and 1 <= c+dc <= cols]

def shuffle(lst):
    random.shuffle(lst)
    return lst

# ── world ────────────────────────────────────────────────────────────────────

def create_world(rows, cols):
    start_safe = set()
    start_safe.add('1,1')
    for nr, nc in get_neighbours(1, 1, rows, cols):
        start_safe.add(f'{nr},{nc}')

    non_start = [f'{r},{c}' for r in range(1, rows+1)
                             for c in range(1, cols+1)
                             if not (r == 1 and c == 1)]

    pits = set(k for k in non_start
               if k not in start_safe and random.random() < 0.2)

    wumpus_candidates = shuffle([k for k in non_start
                                  if k not in pits and k not in start_safe])
    if not wumpus_candidates:
        wumpus_candidates = shuffle([k for k in non_start if k not in pits])
    wumpus = wumpus_candidates[0]

    def has_free_nbr(k):
        r, c = map(int, k.split(','))
        return any(f'{nr},{nc}' not in pits
                   for nr, nc in get_neighbours(r, c, rows, cols))

    gold_candidates = shuffle([k for k in non_start
                                if k not in pits and k != wumpus
                                and k != '1,1' and has_free_nbr(k)])
    if not gold_candidates:
        gold_candidates = shuffle([k for k in non_start
                                   if k not in pits and k != wumpus and k != '1,1'])
    gold = gold_candidates[0]

    return dict(rows=rows, cols=cols, pits=list(pits),
                wumpus=wumpus, gold=gold, wumpus_alive=True)

def has_breeze(r, c, world):
    return any(f'{nr},{nc}' in world['pits']
               for nr, nc in get_neighbours(r, c, world['rows'], world['cols']))

def has_stench(r, c, world):
    return world['wumpus_alive'] and any(
        world['wumpus'] == f'{nr},{nc}'
        for nr, nc in get_neighbours(r, c, world['rows'], world['cols']))

# ── knowledge base ────────────────────────────────────────────────────────────

def create_kb():
    return dict(clauses=[], key_set=set(), steps=0)

def neg(lit):
    return lit[1:] if lit.startswith('-') else '-' + lit

def clause_key(clause):
    return '|'.join(sorted(clause))

def tell(kb, literals):
    c = set(literals)
    for l in c:
        if neg(l) in c:
            return
    k = clause_key(c)
    if k in kb['key_set']:
        return
    for e in kb['clauses']:
        if all(l in c for l in e):
            return
    kb['clauses'] = [e for e in kb['clauses']
                     if not all(l in e for l in c)
                     or kb['key_set'].discard(clause_key(e)) is None]
    # rebuild key_set cleanly
    kb['key_set'] = {clause_key(e) for e in kb['clauses']}
    kb['clauses'].append(c)
    kb['key_set'].add(k)

def ask(kb, literal, max_steps=5000):
    seed = frozenset([neg(literal)])
    sos  = [set(seed)]
    seen = {clause_key(seed)}
    steps = 0

    i = 0
    while i < len(sos) and steps < max_steps:
        c1 = sos[i]; i += 1
        for lit in list(c1):
            comp = neg(lit)
            pool = kb['clauses'] + sos
            for c2 in pool:
                if comp not in c2:
                    continue
                steps += 1
                kb['steps'] += 1
                resolvent = (c1 | c2) - {lit, comp}
                if not resolvent:
                    return True
                if any(neg(l) in resolvent for l in resolvent):
                    continue
                rk = clause_key(resolvent)
                if rk not in seen:
                    seen.add(rk)
                    sos.append(resolvent)
                if steps >= max_steps:
                    return False
    return False

# ── percept axioms ────────────────────────────────────────────────────────────

def tell_percept_axioms(r, c, world, kb):
    tell(kb, [f'-P_{r}_{c}'])
    tell(kb, [f'-W_{r}_{c}'])

    nbrs = get_neighbours(r, c, world['rows'], world['cols'])
    Br = f'B_{r}_{c}'
    Sr = f'S_{r}_{c}'

    if nbrs:
        tell(kb, [neg(Br)] + [f'P_{nr}_{nc}' for nr, nc in nbrs])
        for nr, nc in nbrs:
            tell(kb, [neg(f'P_{nr}_{nc}'), Br])
        tell(kb, [neg(Sr)] + [f'W_{nr}_{nc}' for nr, nc in nbrs])
        for nr, nc in nbrs:
            tell(kb, [neg(f'W_{nr}_{nc}'), Sr])

    breeze  = has_breeze(r, c, world)
    stench  = has_stench(r, c, world)
    glitter = world['gold'] == f'{r},{c}'

    tell(kb, [Br  if breeze  else neg(Br)])
    tell(kb, [Sr  if stench  else neg(Sr)])

    return dict(breeze=breeze, stench=stench, glitter=glitter)

# ── agent ─────────────────────────────────────────────────────────────────────

def create_agent():
    return dict(r=1, c=1,
                visited=['1,1'],
                safe=['1,1'],
                danger=[],
                gold_found_at=None,
                path=[],
                percepts=['None'],
                game_over=False,
                game_won=False,
                has_gold=False,
                has_arrow=True,
                stalled=False)

def infer_all(agent, world, kb):
    safe_set   = set(agent['safe'])
    danger_set = set(agent['danger'])
    for r in range(1, world['rows']+1):
        for c in range(1, world['cols']+1):
            k = f'{r},{c}'
            if k in safe_set or k in danger_set:
                continue
            if ask(kb, f'-P_{r}_{c}') and ask(kb, f'-W_{r}_{c}'):
                safe_set.add(k)
            else:
                if ask(kb, f'P_{r}_{c}') or ask(kb, f'W_{r}_{c}'):
                    danger_set.add(k)
    agent['safe']   = list(safe_set)
    agent['danger'] = list(danger_set)

def bfs_to_target(agent, world, target_key):
    start = f"{agent['r']},{agent['c']}"
    if start == target_key:
        return []
    queue = [(agent['r'], agent['c'], [])]
    seen  = {start}
    safe_set = set(agent['safe'])
    while queue:
        r, c, path = queue.pop(0)
        for nr, nc in get_neighbours(r, c, world['rows'], world['cols']):
            nk = f'{nr},{nc}'
            if nk in seen or nk not in safe_set:
                continue
            seen.add(nk)
            new_path = path + [nk]
            if nk == target_key:
                return new_path
            queue.append((nr, nc, new_path))
    return []

def plan_path(agent, world):
    if agent['has_gold']:
        return bfs_to_target(agent, world, '1,1')

    safe_set    = set(agent['safe'])
    danger_set  = set(agent['danger'])
    visited_set = set(agent['visited'])
    unvisited   = [k for k in safe_set if k not in visited_set]
    if not unvisited:
        return []

    def score(k):
        r, c = map(int, k.split(','))
        return sum(1 for nr, nc in get_neighbours(r, c, world['rows'], world['cols'])
                   if f'{nr},{nc}' not in safe_set and f'{nr},{nc}' not in danger_set)

    candidates = sorted(shuffle(unvisited), key=score, reverse=True)
    for target in candidates:
        path = bfs_to_target(agent, world, target)
        if path:
            return path
    return []

def attempt_shoot(agent, world, kb):
    if not agent['has_arrow']:
        return False

    shoot_dir = None

    for r in range(1, world['rows']+1):
        if r == agent['r']:
            continue
        if ask(kb, f"W_{r}_{agent['c']}"):
            shoot_dir = (1 if r > agent['r'] else -1, 0)
            break

    if not shoot_dir:
        for c in range(1, world['cols']+1):
            if c == agent['c']:
                continue
            if ask(kb, f"W_{agent['r']}_{c}"):
                shoot_dir = (0, 1 if c > agent['c'] else -1)
                break

    if not shoot_dir:
        has_stench_here = any(
            cl == {f"S_{agent['r']}_{agent['c']}"}
            for cl in kb['clauses']
        )
        if has_stench_here:
            danger_set = set(agent['danger'])
            for dr, dc in DIRS:
                r, c = agent['r']+dr, agent['c']+dc
                while 1 <= r <= world['rows'] and 1 <= c <= world['cols']:
                    if f'{r},{c}' in danger_set:
                        shoot_dir = (dr, dc)
                        break
                    r += dr; c += dc
                if shoot_dir:
                    break

    if not shoot_dir:
        return False

    agent['has_arrow'] = False
    dr, dc = shoot_dir
    ar, ac = agent['r']+dr, agent['c']+dc
    hit = False
    while 1 <= ar <= world['rows'] and 1 <= ac <= world['cols']:
        if world['wumpus_alive'] and world['wumpus'] == f'{ar},{ac}':
            hit = True
            break
        ar += dr; ac += dc

    if hit:
        world['wumpus_alive'] = False
        for r in range(1, world['rows']+1):
            for c in range(1, world['cols']+1):
                tell(kb, [f'-W_{r}_{c}'])
        agent['danger'] = [k for k in agent['danger']
                           if ask(kb, f"P_{k.split(',')[0]}_{k.split(',')[1]}")]
        agent['percepts'].append('Scream! Wumpus killed.')
    else:
        r, c = agent['r']+dr, agent['c']+dc
        while 1 <= r <= world['rows'] and 1 <= c <= world['cols']:
            tell(kb, [f'-W_{r}_{c}'])
            r += dr; c += dc
        agent['percepts'].append('Arrow missed.')

    return True

def format_percepts(p):
    lst = []
    if p['breeze']:  lst.append('Breeze')
    if p['stench']:  lst.append('Stench')
    if p['glitter']: lst.append('Glitter')
    return lst if lst else ['None']

# ── in-memory session storage ─────────────────────────────────────────────────
# For a single-user demo; swap for Flask-Session / Redis for multi-user.

_state = {}

def serialize_kb(kb):
    return dict(clauses=[list(c) for c in kb['clauses']],
                key_set=list(kb['key_set']),
                steps=kb['steps'])

def deserialize_kb(data):
    return dict(clauses=[set(c) for c in data['clauses']],
                key_set=set(data['key_set']),
                steps=data['steps'])

def serialize_world(w):
    return dict(w, pits=list(w['pits']))

def deserialize_world(w):
    return dict(w, pits=list(w['pits']))   # pits already a list from JSON

# ── routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/new_game', methods=['POST'])
def new_game():
    data  = request.get_json(force=True)
    rows  = max(3, min(8, int(data.get('rows', 4))))
    cols  = max(3, min(8, int(data.get('cols', 4))))

    world = create_world(rows, cols)
    agent = create_agent()
    kb    = create_kb()

    p = tell_percept_axioms(1, 1, world, kb)
    agent['percepts'] = format_percepts(p)
    infer_all(agent, world, kb)

    _state['world'] = world
    _state['agent'] = agent
    _state['kb']    = kb

    return jsonify(build_response())

@app.route('/step', methods=['POST'])
def step():
    world = _state.get('world')
    agent = _state.get('agent')
    kb    = _state.get('kb')

    if not world or agent['game_over'] or agent['game_won'] or agent['stalled']:
        return jsonify(build_response())

    if not agent['path']:
        agent['path'] = plan_path(agent, world)

        if not agent['path']:
            if agent['has_arrow']:
                fired = attempt_shoot(agent, world, kb)
                if fired:
                    infer_all(agent, world, kb)
                    agent['path'] = plan_path(agent, world)
                    if agent['path']:
                        agent['stalled'] = False
                        return jsonify(build_response())
            agent['stalled'] = True
            return jsonify(build_response())

    next_key = agent['path'].pop(0)
    nr, nc   = map(int, next_key.split(','))
    is_new   = next_key not in agent['visited']

    agent['r'] = nr
    agent['c'] = nc
    agent['visited'].append(next_key)

    pits_set = set(world['pits'])

    if next_key in pits_set:
        agent['game_over'] = True
        agent['percepts']  = ['Fell into a Pit']
    elif world['wumpus'] == next_key and world['wumpus_alive']:
        agent['game_over'] = True
        agent['percepts']  = ['Eaten by the Wumpus']
    else:
        if next_key not in agent['safe']:
            agent['safe'].append(next_key)

        p = tell_percept_axioms(nr, nc, world, kb)
        agent['percepts'] = format_percepts(p)

        if p['glitter'] and not agent['has_gold']:
            agent['has_gold']     = True
            agent['gold_found_at'] = f"{agent['r']},{agent['c']}"
            agent['percepts']      = ['Glitter ✨ — Gold found! Returning...']
            agent['path']          = []

    if agent['has_gold'] and agent['r'] == 1 and agent['c'] == 1:
        agent['game_won'] = True
        agent['path']     = []

    if not agent['game_over'] and not agent['game_won']:
        infer_all(agent, world, kb)

    if is_new and not agent['game_won']:
        agent['path'] = []

    return jsonify(build_response())

def build_response():
    world = _state['world']
    agent = _state['agent']
    kb    = _state['kb']
    return dict(
        world=dict(
            rows=world['rows'],
            cols=world['cols'],
            pits=world['pits'],
            wumpus=world['wumpus'],
            gold=world['gold'],
            wumpus_alive=world['wumpus_alive'],
        ),
        agent=dict(
            r=agent['r'],
            c=agent['c'],
            visited=list(set(agent['visited'])),
            safe=list(set(agent['safe'])),
            danger=list(set(agent['danger'])),
            gold_found_at=agent['gold_found_at'],
            percepts=agent['percepts'],
            game_over=agent['game_over'],
            game_won=agent['game_won'],
            has_gold=agent['has_gold'],
            has_arrow=agent['has_arrow'],
            stalled=agent['stalled'],
        ),
        kb=dict(steps=kb['steps'], count=len(kb['clauses'])),
    )

if __name__ == '__main__':
    app.run(debug=True)