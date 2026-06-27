/**
 * LiveHeatmap — animated West Africa map showing simulated active users + bets in real time.
 * Pure SVG, no external library. Lightweight & responsive.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Activity, MapPin, Users, Zap } from "lucide-react";

const CITIES = [
  { name: "Cotonou", country: "BJ", x: 470, y: 290, weight: 6 },
  { name: "Porto-Novo", country: "BJ", x: 485, y: 295, weight: 3 },
  { name: "Parakou", country: "BJ", x: 460, y: 215, weight: 2 },
  { name: "Lomé", country: "TG", x: 432, y: 290, weight: 4 },
  { name: "Kara", country: "TG", x: 430, y: 230, weight: 1 },
  { name: "Accra", country: "GH", x: 385, y: 295, weight: 3 },
  { name: "Kumasi", country: "GH", x: 365, y: 265, weight: 2 },
  { name: "Lagos", country: "NG", x: 520, y: 295, weight: 5 },
  { name: "Abidjan", country: "CI", x: 310, y: 295, weight: 4 },
  { name: "Yamoussoukro", country: "CI", x: 290, y: 260, weight: 1 },
  { name: "Ouagadougou", country: "BF", x: 340, y: 195, weight: 2 },
  { name: "Niamey", country: "NE", x: 440, y: 165, weight: 1 },
  { name: "Dakar", country: "SN", x: 130, y: 175, weight: 2 },
  { name: "Bamako", country: "ML", x: 235, y: 195, weight: 1 },
  { name: "Conakry", country: "GN", x: 175, y: 245, weight: 1 },
];

const PICKS_SAMPLE = [
  "Manchester City vs Arsenal · +1.5 buts",
  "Real Madrid vs Barcelona · Real gagne",
  "PSG vs Marseille · BTTS oui",
  "Lakers vs Warriors · +210 pts",
  "Maroc vs Sénégal · X2 double chance",
  "Mbappé buteur · 2.10",
  "Bayern vs Dortmund · Over 2.5",
  "Liverpool · victoire @1.65",
  "Nigéria vs Algérie · Nul mi-temps",
  "Egypte gagne · @1.85",
];

export default function LiveHeatmap() {
  const [activity, setActivity] = useState([]);
  const [counter, setCounter] = useState(347);
  const [ticker, setTicker] = useState([]);

  // Spawn a random activity pulse + ticker entry every 1.5-3 seconds
  useEffect(() => {
    const spawn = () => {
      const city = CITIES[Math.floor(Math.random() * CITIES.length)];
      // Weighted random: cities with higher weight are picked more often
      const pool = CITIES.flatMap((c) => Array(c.weight).fill(c));
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const id = Math.random().toString(36).slice(2);
      setActivity((cur) => [...cur.slice(-12), { id, x: chosen.x, y: chosen.y, color: pickColor() }]);
      // Cleanup pulse after 3s
      setTimeout(() => setActivity((cur) => cur.filter((p) => p.id !== id)), 3000);

      // Ticker entry
      const pick = PICKS_SAMPLE[Math.floor(Math.random() * PICKS_SAMPLE.length)];
      const tickerEntry = {
        id,
        text: `${chosen.name} · ${pick}`,
        time: new Date(),
      };
      setTicker((cur) => [tickerEntry, ...cur].slice(0, 5));

      // Counter drift
      setCounter((c) => Math.max(200, Math.min(900, c + Math.floor(Math.random() * 11) - 4)));
    };
    spawn();
    const interval = setInterval(spawn, 1700 + Math.random() * 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative bg-slate-950 text-white py-16 sm:py-20 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }} />
      <div className="absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 border border-emerald-400/40 px-3 py-1 text-xs font-bold text-emerald-300 mb-4">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            EN DIRECT · Activité utilisateurs
          </div>
          <h2 className="font-heading text-3xl sm:text-5xl font-black tracking-tighter">
            Ça <span className="bg-gradient-to-r from-orange-300 via-rose-300 to-amber-300 bg-clip-text text-transparent">vibre</span> partout en Afrique de l'Ouest
          </h2>
          <p className="mt-3 text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
            Heatmap anonymisée des analyses en cours. Aucune donnée personnelle affichée.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-stretch">
          {/* Map */}
          <Card className="lg:col-span-2 bg-slate-900/60 border-white/10 backdrop-blur-sm p-4 sm:p-6 overflow-hidden" data-testid="heatmap-card">
            <svg
              viewBox="0 0 600 380"
              className="w-full h-auto"
              style={{ maxHeight: 400 }}
              role="img"
              aria-label="Carte d'Afrique de l'Ouest avec activité utilisateurs en temps réel"
            >
              {/* Simplified West Africa outline (illustrative, not geographic precision) */}
              <defs>
                <radialGradient id="cityGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(251,146,60,0.55)" />
                  <stop offset="100%" stopColor="rgba(251,146,60,0)" />
                </radialGradient>
                <linearGradient id="landGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
              </defs>

              {/* Land shapes - approximate West Africa silhouette */}
              <path
                d="M70 160 L120 130 L180 140 L240 130 L300 130 L360 130 L420 130 L470 120 L510 130 L540 160 L555 200 L545 230 L555 270 L535 300 L490 320 L450 320 L420 315 L390 320 L355 318 L320 320 L280 315 L240 315 L200 310 L165 305 L130 280 L100 250 L80 220 L65 190 Z"
                fill="url(#landGrad)"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
              />

              {/* Border lines (approximate country separations) */}
              {[
                "M200 130 L210 310",
                "M280 130 L290 320",
                "M350 130 L365 320",
                "M410 130 L420 320",
                "M460 120 L475 320",
              ].map((d, i) => (
                <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              ))}

              {/* City labels */}
              {CITIES.map((c) => (
                <g key={c.name}>
                  <circle cx={c.x} cy={c.y} r="2.2" fill="rgba(248,250,252,0.5)" />
                  <text x={c.x + 6} y={c.y + 3} fontSize="9" fill="rgba(248,250,252,0.65)" fontFamily="ui-sans-serif">
                    {c.name}
                  </text>
                </g>
              ))}

              {/* Live activity pulses */}
              {activity.map((p) => (
                <g key={p.id}>
                  <circle cx={p.x} cy={p.y} r="3" fill={p.color}>
                    <animate attributeName="r" from="3" to="22" dur="2.5s" repeatCount="1" />
                    <animate attributeName="opacity" from="0.9" to="0" dur="2.5s" repeatCount="1" />
                  </circle>
                  <circle cx={p.x} cy={p.y} r="3" fill={p.color}>
                    <animate attributeName="r" from="3" to="14" dur="2.5s" repeatCount="1" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="2.5s" repeatCount="1" />
                  </circle>
                  <circle cx={p.x} cy={p.y} r="2.5" fill="#fff" />
                </g>
              ))}
            </svg>
          </Card>

          {/* Stats + ticker */}
          <div className="flex flex-col gap-4">
            <Card className="bg-gradient-to-br from-orange-500 to-rose-500 border-0 p-5 text-white">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold opacity-90 mb-1">
                <Users className="h-3.5 w-3.5" /> Parieurs actifs maintenant
              </div>
              <div className="font-heading text-5xl font-black tracking-tighter tabular-nums" data-testid="active-counter">
                {counter}
              </div>
              <div className="text-xs opacity-80 mt-1 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Mise à jour temps réel · anonymisé
              </div>
            </Card>

            <Card className="bg-slate-900/60 border-white/10 backdrop-blur-sm p-4 flex-1 overflow-hidden">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-orange-300 mb-3">
                <Activity className="h-3.5 w-3.5" /> Flux d'activité
              </div>
              <div className="space-y-1.5" data-testid="activity-ticker">
                {ticker.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 text-xs text-slate-300 py-1.5 border-b border-white/5 last:border-0"
                    style={{ opacity: 1 - i * 0.15 }}
                  >
                    <MapPin className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span className="truncate">{t.text}</span>
                  </div>
                ))}
                {ticker.length === 0 && (
                  <div className="text-xs text-slate-500 py-2">Connexion en cours…</div>
                )}
              </div>
            </Card>

            <Card className="bg-slate-900/60 border-white/10 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-amber-300 mb-2">
                <Zap className="h-3.5 w-3.5" /> Couverture régionale
              </div>
              <div className="text-2xl font-heading font-black tabular-nums">
                <span className="bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-transparent">15 villes</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Bénin · Togo · Ghana · Nigéria · Côte d'Ivoire · Burkina · Niger · Mali · Sénégal · Guinée</div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function pickColor() {
  const colors = ["#fb923c", "#f97316", "#f43f5e", "#fbbf24", "#34d399"];
  return colors[Math.floor(Math.random() * colors.length)];
}
