import React, { useEffect, useMemo, useState } from "react";

// Interactive Single‑Elimination Bracket (no external UI libs; Tailwind only)
// Fix: persistent deterministic match IDs so winners can be picked in later rounds

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function matchId(r, i) {
  return `r${r}-m${i}`;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function generateSeeding(size) {
  if (size < 2) return [1];
  let arr = [1, 2];
  while (arr.length < size) {
    const S = arr.length * 2;
    const next = [];
    for (const x of arr) {
      next.push(x, S + 1 - x);
    }
    arr = next;
  }
  return arr;
}

const DEFAULT_SAMPLE = `Coffee\nTea\nHot Chocolate\nEspresso\nLatte\nCappuccino\nMatcha\nChai\nMocha\nAmericano\nCortado`;

export default function BracketApp() {
  const [entrantsText, setEntrantsText] = useState("");
  const [shuffle, setShuffle] = useState(true);

  const [initialMatches, setInitialMatches] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [winnersMap, setWinnersMap] = useState({});
  const [title, setTitle] = useState("Tournament Tool");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("se_bracket_state") || "null");
      if (saved && saved.initialMatches) {
        setEntrantsText(saved.entrantsText || "");
        setShuffle(saved.shuffle ?? true);
        setInitialMatches(saved.initialMatches || []);
        setWinnersMap(saved.winnersMap || {});
        setTitle(saved.title || "Tournament Tool");
      }
    } catch {}
  }, []);

  useEffect(() => {
    const payload = { entrantsText, shuffle, initialMatches, winnersMap, title };
    localStorage.setItem("se_bracket_state", JSON.stringify(payload));
  }, [entrantsText, shuffle, initialMatches, winnersMap, title]);

  const entrants = useMemo(() =>
    entrantsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  [entrantsText]);

  function buildBracket() {
    if (entrants.length === 0) return;

    const n = entrants.length;
    const size = Math.max(2, nextPowerOfTwo(n));

    let seeded = entrants.map((name, i) => ({
      id: uid("p"),
      name,
      seed: i + 1,
      isBye: false,
    }));

    if (shuffle) {
      for (let i = seeded.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
      }
      seeded = seeded.map((p, idx) => ({ ...p, seed: idx + 1 }));
    }

    const seedingPositions = generateSeeding(size);
    const slots = seedingPositions.map((seed) => {
      if (seed <= n) return seeded[seed - 1];
      return { id: uid("bye"), name: "BYE", seed, isBye: true };
    });

    const round0 = [];
    for (let i = 0; i < slots.length; i += 2) {
      round0.push({
        id: matchId(0, i / 2),
        playerA: slots[i] || null,
        playerB: slots[i + 1] || null,
        winnerId: null,
      });
    }

    const autoWins = {};
    for (const m of round0) {
      if (m.playerA && m.playerB) {
        if (m.playerA.isBye && !m.playerB.isBye) autoWins[m.id] = m.playerB.id;
        if (m.playerB.isBye && !m.playerA.isBye) autoWins[m.id] = m.playerA.id;
      }
    }

    setInitialMatches(round0);
    setWinnersMap(autoWins);
  }

  useEffect(() => {
    if (!initialMatches.length) {
      setRounds([]);
      return;
    }
    const size = initialMatches.length * 2;
    const numRounds = Math.log2(size);

    const rds = [];
    const r0 = initialMatches.map((m, i) => ({ ...m, id: matchId(0, i), winnerId: winnersMap[m.id] || null }));
    rds.push(r0);

    for (let r = 1; r < numRounds; r++) {
      const matchesInRound = size / Math.pow(2, r + 1);
      const blank = Array.from({ length: matchesInRound }, (_, idx) => ({
        id: matchId(r, idx),
        playerA: null,
        playerB: null,
        winnerId: winnersMap[matchId(r, idx)] || null,
      }));
      rds.push(blank);
    }

    function placeNext(rIdx, mIdx, competitor) {
      if (rIdx >= rds.length - 1 || !competitor) return;
      const nextRound = rds[rIdx + 1];
      const parentIdx = Math.floor(mIdx / 2);
      const isTop = mIdx % 2 === 0;
      const parent = nextRound[parentIdx];
      if (isTop) parent.playerA = competitor; else parent.playerB = competitor;
    }

    for (let r = 0; r < rds.length - 1; r++) {
      const cur = rds[r];
      for (let i = 0; i < cur.length; i++) {
        const m = cur[i];
        const a = m.playerA, b = m.playerB;
        let winner = null;
        if (winnersMap[m.id]) {
          winner = [a, b].find((p) => p && p.id === winnersMap[m.id]) || null;
          m.winnerId = winnersMap[m.id];
        } else if (a && b) {
          if (a.isBye && !b.isBye) winner = b;
          if (b.isBye && !a.isBye) winner = a;
        }
        placeNext(r, i, winner);
      }
    }

    setRounds(rds);
  }, [initialMatches, winnersMap]);

  const champion = useMemo(() => {
    if (!rounds.length) return null;
    const last = rounds[rounds.length - 1][0];
    if (!last) return null;
    const a = last.playerA, b = last.playerB;
    if (!a || !b) return null;
    const selectedId = winnersMap[last.id];
    return [a, b].find((p) => p && p.id === selectedId) || null;
  }, [rounds, winnersMap]);

  function handlePickWinner(rIdx, mIdx, pick) {
    const match = rounds[rIdx][mIdx];
    if (!match || !pick || pick.isBye) return;
    setWinnersMap((prev) => ({ ...prev, [match.id]: pick.id }));
  }

  function resetAll() {
    setInitialMatches([]);
    setRounds([]);
    setWinnersMap({});
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-slate-900/60 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 24 24" className="opacity-80">
            <path fill="currentColor" d="M3 5h6v4H3zm12 0h6v4h-6zM9 10h6v4H9zM3 15h6v4H3zm12 0h6v4h-6z"/>
          </svg>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-xl font-semibold outline-none border-b border-transparent focus:border-white/30 transition-colors"
            placeholder="Bracket title"
          />
          <div className="ml-auto flex items-center gap-2">
            {champion && (
              <div className="text-sm px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30">
                Champion: <span className="font-semibold text-emerald-300">{champion.name}</span>
              </div>
            )}
            <button onClick={resetAll} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[.99]">Reset</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid lg:grid-cols-[380px,1fr] gap-6">
        <section className="space-y-4">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow">
            <h2 className="text-lg font-semibold mb-2">Setup</h2>
            <label className="text-sm block mb-1 opacity-80">Entrants (one per line)</label>
            <textarea
              value={entrantsText}
              onChange={(e) => setEntrantsText(e.target.value)}
              rows={10}
              placeholder="Paste names here..."
              className="w-full resize-y rounded-xl bg-slate-950/50 border border-white/10 focus:border-white/30 outline-none p-3 font-mono"
            />

            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-emerald-400" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                Shuffle entrants
              </label>
              <div className="flex gap-2">
                <button onClick={() => setEntrantsText(DEFAULT_SAMPLE)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">Sample</button>
                <button onClick={buildBracket} disabled={entrants.length === 0} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500/25 disabled:opacity-50">Build bracket</button>
              </div>
            </div>

            {entrants.length > 0 && (
              <p className="text-xs mt-2 opacity-70">Detected <span className="font-semibold">{entrants.length}</span> entrant{entrants.length===1?"":"s"}. Non‑power‑of‑two sizes get automatic BYEs.</p>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow">
            <h3 className="text-base font-semibold mb-2">Tips</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm opacity-80">
              <li>Click a name to advance them. Click the other name to change your pick.</li>
              <li>Use <em>Reset</em> in the header to start over.</li>
              <li>BYEs auto‑advance opponents in round 1.</li>
            </ul>
          </div>
        </section>

        <section className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow overflow-x-auto">
          {rounds.length === 0 ? (
            <div className="h-64 grid place-items-center text-slate-300/70">Enter entrants and build your bracket ✨</div>
          ) : (
            <div className="min-w-[720px]">
              <div className="flex items-start gap-6">
                {rounds.map((matches, rIdx) => (
                  <div key={rIdx} className="min-w-[220px] flex-1">
                    <h4 className="text-sm font-semibold mb-3 opacity-80">{rIdx === rounds.length - 1 ? "Final" : `Round ${rIdx + 1}`}</h4>
                    <div className="flex flex-col gap-4">
                      {matches.map((m, mIdx) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          selectedId={winnersMap[m.id] || null}
                          onPick={(p) => handlePickWinner(rIdx, mIdx, p)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs opacity-60">
        Super cool tournament builder • Single elimination
      </footer>
    </div>
  );
}

function MatchCard({ match, selectedId, onPick }) {
  const a = match.playerA;
  const b = match.playerB;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-2 shadow-sm">
      <PlayerRow player={a} selected={selectedId === (a?.id)} disabled={!a || a?.isBye} onClick={() => a && !a.isBye && onPick(a)} />
      <div className="h-px bg-white/10 my-1" />
      <PlayerRow player={b} selected={selectedId === (b?.id)} disabled={!b || b?.isBye} onClick={() => b && !b.isBye && onPick(b)} />
      <div className="text-[10px] mt-1 opacity-60 flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/30" />
        Match ID: {match.id}
      </div>
    </div>
  );
}

function PlayerRow({ player, selected, onClick, disabled }) {
  const label = player ? player.name : "TBD";
  const isBye = player?.isBye;
  return (
    <button
      disabled={disabled || !player}
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2 rounded-lg transition border",
        selected ? "bg-emerald-500/20 border-emerald-400/40" : "bg-white/5 border-white/10 hover:bg-white/10",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
      title={isBye ? "BYE – automatically loses/advances opponent" : "Click to pick winner"}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate">{label}</span>
        {player?.seed != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/10">#{player.seed}</span>
        )}
      </div>
    </button>
  );
}
