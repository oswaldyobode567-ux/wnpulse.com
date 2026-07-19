import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import MatchCard from "@/components/MatchCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  Trophy, Flame, ChevronRight, Activity, Lock,
  Sparkles, Radio, Send, CheckCircle2, XCircle,
  Clock, TrendingUp, RefreshCw, Filter
} from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeMatches } from "@/services/realtimeService";
import PaymentModal from "@/components/payment/PaymentModal";
import { toast } from "sonner";

const SPORT_TABS = [
  { key: "all",        label: "Tous",       icon: "🌍" },
  { key: "soccer",     label: "Football",   icon: "⚽" },
  { key: "basketball", label: "Basketball", icon: "🏀" },
  { key: "tennis",     label: "Tennis",     icon: "🎾" },
  { key: "icehockey",  label: "Hockey",     icon: "🏒" },
  { key: "baseball",   label: "Baseball",   icon: "⚾" },
  { key: "mma",        label: "MMA",        icon: "🥊" },
];

const BET_FILTERS = [
  { key: "all",           label: "Tous les marchés" },
  { key: "victoire",      label: "🏆 Victoire" },
  { key: "double_chance", label: "🔄 Double chance" },
  { key: "over_25",       label: "📈 Over 2.5" },
  { key: "btts",          label: "🎯 BTTS" },
  { key: "handicap",      label: "⚖️ Handicap" },
  { key: "cartons",       label: "🟨 Cartons" },
  { key: "corners",       label: "📐 Corners" },
  { key: "mi_temps",      label: "⏱ Mi-temps" },
];

function matchesBetFilter(pick = "", filterKey) {
  if (filterKey === "all") return true;
  const p = pick.toLowerCase();
  switch (filterKey) {
    case "victoire":      return p.includes("victoire") || p.includes("vainqueur");
    case "double_chance": return p.includes("double chance") || p.includes("1x") || p.includes("x2");
    case "over_25":       return p.includes("2.5");
    case "btts":          return p.includes("équipes marquent") || p.includes("btts");
    case "handicap":      return p.includes("handicap") || p.includes("spread") || p.includes("points");
    case "cartons":       return p.includes("carton");
    case "corners":       return p.includes("corner");
    case "mi_temps":      return p.includes("mi-temps") || p.includes("période");
    default:              return true;
  }
}

const LEAGUE_PRIORITY = [
  "FIFA World Cup","Coupe du Monde","Champions League","UEFA Champions League",
  "Premier League","La Liga","Bundesliga","Ligue 1","Serie A",
  "Europa League","CAF Champions League","Africa Cup",
  "NBA","EuroLeague","ATP","WTA","NHL","MLB",
];

function groupByLeague(matches) {
  const groups = {};
  for (const m of matches) {
    const league = m.sport_title || "Autre";
    if (!groups[league]) groups[league] = [];
    groups[league].push(m);
  }
  return Object.entries(groups).sort(([a],[b]) => {
    const ia = LEAGUE_PRIORITY.findIndex(p => a.includes(p));
    const ib = LEAGUE_PRIORITY.findIndex(p => b.includes(p));
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { matches, loading, lastUpdate, refresh } = useRealtimeMatches();
  const [topPicks,    setTopPicks]   = useState([]);
  const [topLoading,  setTopLoading] = useState(true);
  const [validated,   setValidated]  = useState([]);
  const [sport,       setSport]      = useState("all");
  const
