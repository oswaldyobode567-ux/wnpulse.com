import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Trophy, Flame, Lock, Sparkles, Radio, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";
import { toast } from "sonner";
const BET_FILTERS = [{
  key: "all",
  label: "Tous"
}, {
  key: "Vainqueur",
  label: "🏆 Victoire"
}, {
  key: "Double chance",
  label: "🔄 Double chance"
}, {
  key: "over_2_5",
  label: "📈 Over 2.5"
}, {
  key: "BTTS",
  label: "🎯 BTTS"
}, {
  key: "Handicap",
  label: "⚖️ Handicap"
}, {
  key: "Over/Under",
  label: "⚽ Over/Under"
}];
function matchesBetFilter(pick, filterKey) {
  if (filterKey === "all") return true;
  const label = (pick?.market_label || "").toLowerCase();
  const pickStr = (pick?.pick || "").toLowerCase();
  switch (filterKey) {
    case "Vainqueur":
      return label.includes("vainqueur") || label.includes("1x2") || label.includes("h2h");
    case "Double chance":
      return label.includes("double");
    case "over_2_5":
      return label.includes("over") && (pickStr.includes("2.5") || pickStr.includes("over 2"));
    case "BTTS":
      return label.includes("btts") || label.includes("les deux") || label.includes("both");
    case "Handicap":
      return label.includes("handicap") || label.includes("spread");
    case "Over/Under":
      return label.includes("over") || label.includes("under") || label.includes("total");
    default:
      return true;
  }
}
function marketColor(label = "") {
  const l = label.toLowerCase();
  if (l.includes("over") && l.includes("2.5")) return "bg-blue-100 text-blue-700 border-blue-200";
  if (l.includes("btts") || l.includes("les deux")) return "bg-purple-100 text-purple-700 border-purple-200";
  if (l.includes("double")) return "bg-teal-100 text-teal-700 border-teal-200";
  if (l.includes("handicap")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (l.includes("over") || l.includes("under")) return "bg-indigo-100 text-indigo-700 border-indigo-200";
  return "bg-orange-100 text-orange-700 border-orange-200";
}
export default function TopPicksPage() {
  const i18n = usePageLanguage();
  const {
    user
  } = useAuth();
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [betFilter, setBetFilter] = useState("all");
  const [payState, setPayState] = useState({
    isOpen: false,
    tier: "PRO"
  });
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";
  const isAdmin = Boolean(user?.is_admin);
  useEffect(() => {
    api.get("/predictions/top").then(r => setPicks(r.data)).finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => {
    return picks.filter(p => matchesBetFilter(p, betFilter));
  }, [picks, betFilter]);
  const shareWA = (p, e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = [i18n.t("\uD83C\uDFAF *Pick WinPulse*", {}), `${p.sport_title} · ${i18n.formatPattern(p.commence_time, "DD/MM HH:mm")}`, "", i18n.t("*{{v0}}* vs *{{v1}}*", {
      v0: p.home_team,
      v1: p.away_team
    }), `👉 ${p.pick} @ *${p.pick_odds}*`, i18n.t("March\xE9 : {{v0}}", {
      v0: p.market_label || "—"
    }), i18n.t("Confiance IA : {{v0}}%", {
      v0: Math.round(p.confidence || 0)
    }), "", "https://wnpulse.com"].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    toast.success(i18n.t("WhatsApp ouvert"));
  };
  return <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" />{i18n.t("S\xE9lection \xE9ditoriale automatique")}</div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{i18n.t("\xC0 la une \u2014 Top picks du jour")}</h1>
          <p className="mt-1 text-sm text-slate-600">{i18n.rich("Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}", {
            v0: i18n.tx(picks.length > 0 && <span className="ms-2 text-orange-600 font-semibold">{i18n.rich("{{v0}} picks analys\xE9s", {
                v0: i18n.tx(picks.length)
              })}</span>)
          })}
          </p>
        </div>

        {/* Filtres par type de pari */}
        <div className="flex flex-wrap gap-2 mb-5">
          {i18n.tx(BET_FILTERS.map(f => <button key={f.key} onClick={() => setBetFilter(f.key)} className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${betFilter === f.key ? "bg-orange-600 text-white border-orange-600" : "bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-600"}`}>
              {i18n.tx(f.label)}
              {i18n.tx(f.key !== "all" && <span className="ms-1 opacity-60">
                  ({i18n.tx(picks.filter(p => matchesBetFilter(p, f.key)).length)})
                </span>)}
            </button>))}
        </div>

        {i18n.tx(isFree && <Card className="mb-6 border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50 p-4 flex items-center gap-3" data-testid="upgrade-banner-top">
            <div className="h-10 w-10 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-slate-900 text-sm">{i18n.rich("1 pick visible \xB7 {{v0}} verrouill\xE9s", {
              v0: i18n.tx(Math.max(0, picks.length - 1))
            })}</div>
              <div className="text-xs text-slate-700">{i18n.t("Passe Pro pour voir tous les picks et les 3 combin\xE9s du jour.")}</div>
            </div>
            <Link to="/app/abonnement">
              <Button size="sm" className="wp-gradient-warm text-white border-0" data-testid="upgrade-cta-top">{i18n.t("D\xE9bloquer")}</Button>
            </Link>
          </Card>)}

        {i18n.tx(loading ? <div className="grid sm:grid-cols-2 gap-4">
            {i18n.tx([1, 2, 3, 4].map(i => <Skeleton key={i} className="h-44" />))}
          </div> : filtered.length === 0 ? <Card className="p-12 text-center bg-white border-slate-200">
            <div className="text-2xl mb-2">🔍</div>
            <div className="text-slate-700 font-semibold">{i18n.t("Aucun pick pour ce march\xE9.")}</div>
            <Button variant="outline" className="mt-4" onClick={() => setBetFilter("all")}>{i18n.t("Voir tous les picks")}</Button>
          </Card> : <div className="grid sm:grid-cols-2 gap-4" data-testid="top-picks-grid">
            {i18n.tx(filtered.map((p, i) => {
          const locked = p.locked || !p.pick;
          return <Link key={p.match_id} to={`/app/match/${p.match_id}`} data-testid={`top-pick-card-${p.match_id}`}>
                  <Card className={`border p-5 hover:shadow-md transition-all h-full relative ${locked ? "bg-neutral-50 border-dashed border-orange-200" : "bg-white border-orange-200/60"} ${p.is_live ? "ring-2 ring-rose-500/40" : ""}`}>

                    <div className="absolute top-3 end-3 flex items-center gap-1.5">
                      {i18n.tx(p.is_live && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider animate-pulse">
                          <Radio className="h-2.5 w-2.5" />{i18n.t("LIVE")}</span>)}
                      {i18n.tx(locked ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-bold">
                          <Lock className="h-3 w-3" />{i18n.t("PRO")}</span> : <ConfidenceBadge label={i18n.tx(p.label)} confidence={p.confidence} />)}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex-wrap">
                      <span className="bg-slate-900 text-white rounded-md px-1.5 py-0.5 font-mono">#{i18n.tx(i + 1)}</span>
                      <Flame className="h-3 w-3 text-orange-500" />
                      {i18n.tx(p.sport_title)}
                      <span>·</span>
                      <span className="font-mono">{i18n.formatPattern(p.commence_time, "DD/MM HH:mm")}</span>
                      {i18n.tx(p.market_label && !locked && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${marketColor(p.market_label)}`}>
                          {i18n.bet(p.market_label)}
                        </span>)}
                    </div>

                    <div className="font-heading font-bold text-lg text-slate-900 mb-1">{p.home_team}</div>
                    <div className="text-xs text-slate-400 mb-1">{i18n.t("vs")}</div>
                    <div className="font-heading font-bold text-lg text-slate-900 mb-4">{p.away_team}</div>

                    <div className="pt-3 border-t border-slate-100 flex items-end justify-between">
                      {i18n.tx(locked ? <div className="w-full">
                          <div className="text-[10px] uppercase tracking-wider text-orange-600 font-bold mb-1">{i18n.t("Pronostic verrouill\xE9")}</div>
                          <div className="text-xs text-slate-500">{i18n.t("Passe Pro pour d\xE9bloquer")}</div>
                        </div> : <>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{i18n.t("Pronostic")}</div>
                            <div className="text-base font-bold text-orange-600">{i18n.bet(p.pick)}</div>
                          </div>
                          <div className="text-end">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{i18n.t("Cote")}</div>
                            <div className="font-mono text-xl font-bold text-slate-900">{i18n.tx(p.pick_odds)}</div>
                          </div>
                        </>)}
                    </div>

                    {/* Bouton WhatsApp ADMIN seulement */}
                    {i18n.tx(isAdmin && !locked && <button onClick={e => shareWA(p, e)} className="absolute bottom-3 end-3 h-8 w-8 rounded-full bg-[#25D366] hover:bg-[#1ebe5c] text-white grid place-items-center shadow-md" title={i18n.t("Partager sur WhatsApp (Admin)")} data-testid={`admin-share-whatsapp-top-${p.match_id}`}>
                        <Send className="h-3.5 w-3.5" />
                      </button>)}
                  </Card>
                </Link>;
        }))}
          </div>)}
      </div>

      <PaymentModal isOpen={payState.isOpen} onClose={() => setPayState({
      isOpen: false,
      tier: payState.tier
    })} targetTier={payState.tier} />
    </AppLayout>;
}
function ConfidenceBadge({
  label,
  confidence
}) {
  const i18n = usePageLanguage();
  const key = String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const color = /sur|safe/.test(key) ? "bg-green-100 text-green-700 border-green-200" : /modere|value/.test(key) ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-red-100 text-red-700 border-red-200";
  const text = /sur|safe/.test(key) ? "🟢 SÛR" : /modere|value/.test(key) ? "🟡 MODÉRÉ" : "🔴 RISQUÉ";
  return <span className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${color}`}>{i18n.tx(text)}{i18n.tx(confidence != null && Number.isFinite(Number(confidence)) && <bdi>{i18n.formatNumber(Number(confidence) / 100, {
        style: "percent",
        maximumFractionDigits: 0
      })}</bdi>)}</span>;
}
