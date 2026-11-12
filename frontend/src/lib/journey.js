import { API } from "@/lib/api";

const CHOICE = "wp_measure_journey";
const VISIT = "wp_journey_session";
const RETURN = "wp_journey_signup";
const DAY = 86400000;
const SOURCES = ["telegram", "facebook", "instagram", "tiktok", "campaign"];
const sent = new Map();

export function journeyChoice() {
  try { return localStorage.getItem(CHOICE); } catch { return null; }
}
export function setJourneyChoice(allowed) {
  try {
    localStorage.setItem(CHOICE, allowed ? "yes" : "no");
    if (!allowed) {
      sessionStorage.removeItem(VISIT);
      localStorage.removeItem(RETURN);
    }
  } catch { /* Storage is optional. */ }
}
function visit(create) {
  if (journeyChoice() !== "yes" || navigator.globalPrivacyControl || navigator.doNotTrack === "1") return null;
  try {
    let data = JSON.parse(sessionStorage.getItem(VISIT) || "null");
    if (data && Date.now() - data.at > 86400000) data = null;
    if (!data && create) {
      const via = new URLSearchParams(location.search).get("via");
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
      data = { token, source: SOURCES.includes(via) ? via : "direct", at: Date.now() };
      sessionStorage.setItem(VISIT, JSON.stringify(data));
    }
    return data;
  } catch { return null; }
}
export function journeyToken() { return visit(false)?.token; }

export function trackJourney(event, create = false) {
  sendJourneyEvent(event, visit(create));
}

function sendJourneyEvent(event, data) {
  if (!data) return;
  const key = `${data.token}:${event}`;
  if (sent.has(key)) return;
  // A same-tab link must work even when the request finishes after navigation.
  const request = fetch(`${API}/journey/events`, {
    method: "POST", keepalive: true, credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: data.token, source: data.source, event }),
  }).then(r => { if (!r.ok) sent.delete(key); }).catch(() => sent.delete(key));
  sent.set(key, request);
}

export function trackJourneySignup(userId) {
  if (!userId) return;
  const data = visit(true);
  if (!data) return;
  sendJourneyEvent("visit", data);
  sendJourneyEvent("signup", data);
  try { localStorage.setItem(RETURN, JSON.stringify({ ...data, userId, signupAt: Date.now() })); }
  catch { /* Storage is optional. */ }
}

export function trackJourneyReturn(userId) {
  if (journeyChoice() !== "yes" || navigator.globalPrivacyControl || navigator.doNotTrack === "1") return;
  try {
    const data = JSON.parse(localStorage.getItem(RETURN) || "null");
    if (!data) return;
    const age = Date.now() - data.signupAt;
    if (age > 7 * DAY) { localStorage.removeItem(RETURN); return; }
    if (data.userId !== userId) return;
    sendJourneyEvent("signup", data);
    if (age >= DAY) sendJourneyEvent("return", data);
  } catch { /* Storage is optional. */ }
}

export function proIntent(search) {
  const params = new URLSearchParams(search);
  if (params.get("next") !== "pro") return "";
  const ref = params.get("reference");
  return "next=pro" + (/^PE-[A-F0-9]{8}$/.test(ref || "") ? `&reference=${ref}` : "");
}
export function destinationAfterAuth(search) {
  const intent = proIntent(search);
  if (!intent) return "/app";
  const reference = new URLSearchParams(intent).get("reference");
  return "/app/abonnement" + (reference ? `?payment=return&reference=${reference}` : "");
}
