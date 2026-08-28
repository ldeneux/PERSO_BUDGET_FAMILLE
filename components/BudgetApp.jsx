"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  LayoutGrid,
  CalendarDays,
  List,
  Pencil,
  Settings as SettingsIcon,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const MONTH_COUNT = 24;
const PALETTE = ["emerald", "amber", "rose", "sky", "violet", "orange", "teal", "fuchsia", "lime", "cyan", "pink", "indigo", "stone"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const PERIODICITIES = ["Annuelle", "Aucune", "Hebdomadaire", "Mensuelle", "PayPal 4x", "Semestrielle", "Trimestrielle"];

function todayMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function addMonths(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(monthKey, short = false) {
  const [y, m] = monthKey.split("-").map(Number);
  const name = MONTH_NAMES[m - 1];
  return short ? `${name.slice(0, 3)} ${String(y).slice(2)}` : `${name} ${y}`;
}
function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}
function monthDiff(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (ay * 12 + am) - (by * 12 + bm);
}
function entryAppliesToMonth(e, month) {
  const diff = monthDiff(month, e.month);
  if (diff < 0) return false;
  if (e.recurring_end && month > e.recurring_end) return false;
  switch (e.periodicity) {
    case "Mensuelle":
    case "Hebdomadaire":
      return true;
    case "Trimestrielle":
      return diff % 3 === 0;
    case "Semestrielle":
      return diff % 6 === 0;
    case "Annuelle":
      return diff % 12 === 0;
    case "PayPal 4x":
      return diff <= 3;
    case "Aucune":
    default:
      return diff === 0;
  }
}
function weeklyDaysInMonth(entry, month) {
  const total = daysInMonth(month);
  const anchor = entry.day || 1;
  const days = [];
  for (let k = 0; k < 6; k++) {
    const d = anchor + 7 * k;
    if (d > total) break;
    days.push(d);
  }
  return days.length ? days : [Math.min(anchor, total)];
}
function entryOccurrencesInMonth(entry, month) {
  if (!entryAppliesToMonth(entry, month)) return [];
  if (entry.periodicity === "Hebdomadaire") return weeklyDaysInMonth(entry, month);
  return [entry.day || 1];
}
function monthlyTotalByType(list, month, type) {
  return list.reduce((sum, e) => {
    if (e.type !== type) return sum;
    const occ = entryOccurrencesInMonth(e, month);
    return sum + Number(e.amount) * occ.length;
  }, 0);
}
function netForMonth(list, month) {
  return monthlyTotalByType(list, month, "credit") - monthlyTotalByType(list, month, "debit");
}

function isObsolete(e, currentMonthStart) {
  if (e.recurring_end && e.recurring_end < currentMonthStart) return true;
  if (e.periodicity === "Aucune" && e.month < currentMonthStart) return true;
  return false;
}

const NAV_ITEMS = [
  { key: "entries", label: "Écritures", icon: List },
  { key: "monthly", label: "Vue mensuelle", icon: CalendarDays },
  { key: "simulation", label: "Simulation budgétaire 24 mois", icon: LayoutGrid },
];

export default function BudgetApp({ session }) {
  const [activeTab, setActiveTab] = useState("entries");
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [{ data: s }, { data: cats }, { data: ents }] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("categories").select("*").order("name", { ascending: true }),
        supabase.from("entries").select("*").order("month", { ascending: true }),
      ]);

      if (!s) {
        const startMonth = todayMonthKey();
        await supabase.from("settings").insert({ id: 1, solde_initial: 0, start_month: startMonth, show_inactive_entries: true, include_inactive_in_calcs: false, hide_obsolete_entries: false });
        setSettings({ solde_initial: 0, start_month: startMonth, show_inactive_entries: true, include_inactive_in_calcs: false, hide_obsolete_entries: false });
      } else {
        setSettings(s);
      }

      setCategories(cats || []);
      setEntries(ents || []);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("Impossible de charger les données. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel("budget-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  const months = useMemo(() => {
    if (!settings) return [];
    return Array.from({ length: MONTH_COUNT }, (_, i) => addMonths(settings.start_month, i));
  }, [settings]);

  const categoryById = useMemo(() => {
    const map = {};
    categories.forEach((c) => (map[c.id] = c));
    return map;
  }, [categories]);

  const calcEntries = useMemo(
    () => entries.filter((e) => e.active || settings?.include_inactive_in_calcs),
    [entries, settings]
  );

  const chartData = useMemo(() => {
    if (!settings) return [];
    let bal = Number(settings.solde_initial) || 0;
    return months.map((m) => {
      bal += netForMonth(calcEntries, m);
      return {
        month: m,
        label: monthLabel(m, true),
        solde: Math.round(bal),
        soldeFin: bal,
        depenses: Math.round(monthlyTotalByType(calcEntries, m, "debit")),
        recettes: Math.round(monthlyTotalByType(calcEntries, m, "credit")),
      };
    });
  }, [settings, months, calcEntries]);

  const soldeActuel = chartData[0] ? chartData[0].solde : 0;
  const soldeHorizon = chartData[MONTH_COUNT - 1] ? chartData[MONTH_COUNT - 1].solde : 0;
  const avgRevenu = chartData.length ? chartData.reduce((s, c) => s + c.recettes, 0) / chartData.length : 0;
  const avgDepense = chartData.length ? chartData.reduce((s, c) => s + c.depenses, 0) / chartData.length : 0;

  const soldeDebutMoisActif = useMemo(() => {
    if (!settings) return 0;
    if (activeIdx === 0) return Number(settings.solde_initial) || 0;
    return chartData[activeIdx - 1] ? chartData[activeIdx - 1].soldeFin : Number(settings.solde_initial) || 0;
  }, [settings, chartData, activeIdx]);

  if (loading) {
    return <div className="w-full min-h-screen flex items-center justify-center text-stone-400 text-sm font-sans">Chargement du budget…</div>;
  }

  const activeMonth = months[activeIdx];

  async function saveEntry(fields, existingId) {
    const payload = {
      category_id: fields.categoryId,
      label: fields.label,
      amount: fields.amount,
      type: fields.type,
      month: fields.month,
      day: fields.day,
      periodicity: fields.periodicity,
      recurring_end: fields.recurringEnd,
      active: fields.active,
    };
    const { error } = existingId
      ? await supabase.from("entries").update(payload).eq("id", existingId)
      : await supabase.from("entries").insert(payload);
    if (error) { setErrorMsg("Impossible d'enregistrer cette écriture."); return false; }
    fetchAll();
    return true;
  }
  async function deleteEntry(id) {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) setErrorMsg("Impossible de supprimer cette écriture.");
    else fetchAll();
  }
  async function addCategory(name, color) {
    const { error } = await supabase.from("categories").insert({ name, color });
    if (error) setErrorMsg("Impossible d'ajouter cette catégorie.");
    else fetchAll();
  }
  async function updateCategory(id, fields) {
    const { error } = await supabase.from("categories").update(fields).eq("id", id);
    if (error) setErrorMsg("Impossible de modifier cette catégorie.");
    else fetchAll();
  }
  async function removeCategory(id) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      setErrorMsg("Cette catégorie est utilisée par des écritures : réaffectez-les d'abord.");
      return false;
    }
    fetchAll();
    return true;
  }
  async function updateSoldeInitial(v) {
    const n = parseFloat(v);
    const value = isNaN(n) ? 0 : n;
    setSettings((s) => ({ ...s, solde_initial: value }));
    const { error } = await supabase.from("settings").update({ solde_initial: value }).eq("id", 1);
    if (error) setErrorMsg("Impossible d'enregistrer le solde de départ.");
  }
  async function updateDisplaySetting(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
    const { error } = await supabase.from("settings").update({ [key]: value }).eq("id", 1);
    if (error) setErrorMsg("Impossible d'enregistrer ce réglage.");
  }
  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="w-full min-h-screen bg-stone-50 font-sans text-stone-900 flex">
      <aside className="w-56 shrink-0 bg-stone-100 border-r border-stone-200 min-h-screen p-4 hidden sm:flex flex-col">
        <div className="mb-6 px-1">
          <p className="font-serif text-lg text-emerald-900">Budget famille</p>
          <p className="text-xs text-stone-500 truncate">{session.user.email}</p>
        </div>
        <nav className="space-y-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-md ${
                  active ? "bg-emerald-800 text-white" : "text-stone-600 hover:bg-stone-200"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
          <div className="pt-2 mt-2 border-t border-stone-200">
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-md ${
                activeTab === "settings" ? "bg-stone-700 text-white" : "text-stone-500 hover:bg-stone-200"
              }`}
            >
              <SettingsIcon size={16} /> Paramétrage
            </button>
          </div>
        </nav>
        <button onClick={logout} className="flex items-center gap-2 text-sm text-stone-500 px-3 py-2 rounded-md hover:bg-stone-200">
          <LogOut size={16} /> Déconnexion
        </button>
      </aside>

      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-stone-100 border-t border-stone-200 flex z-10">
        {[...NAV_ITEMS, { key: "settings", label: "Paramétrage", icon: SettingsIcon }].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[11px] ${active ? (item.key === "settings" ? "text-stone-700" : "text-emerald-800") : "text-stone-500"}`}
            >
              <Icon size={18} />
              {item.label.split(" ")[0]}
            </button>
          );
        })}
      </div>

      <main className="flex-1 min-w-0 pb-16 sm:pb-0">
        {errorMsg && (
          <div className="m-5 sm:m-8 sm:mb-0 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{errorMsg}</div>
        )}

        {activeTab === "entries" && (
          <div className="max-w-5xl mx-auto p-5 sm:p-8 space-y-6">
            <div>
              <h1 className="font-serif text-2xl text-emerald-900 tracking-tight">Écritures</h1>
              <p className="text-stone-500 text-sm mt-1">Toutes les écritures, par catégorie. Clique une ligne pour la modifier.</p>
            </div>
            <EntriesManager
              entries={entries}
              categories={categories}
              categoryById={categoryById}
              months={months}
              settings={settings}
              onSave={saveEntry}
              onDelete={deleteEntry}
            />
          </div>
        )}

        {activeTab === "monthly" && (
          <div className="max-w-3xl mx-auto p-5 sm:p-8 space-y-6">
            <div>
              <h1 className="font-serif text-2xl text-emerald-900 tracking-tight">Vue mensuelle</h1>
              <p className="text-stone-500 text-sm mt-1">Détail jour par jour, avec solde cumulé.</p>
            </div>
            <MonthPicker months={months} activeIdx={activeIdx} setActiveIdx={setActiveIdx} />
            <DailyView
              month={activeMonth}
              entries={entries}
              categoryById={categoryById}
              settings={settings}
              startBalance={soldeDebutMoisActif}
            />
          </div>
        )}

        {activeTab === "simulation" && (
          <div className="max-w-3xl mx-auto p-5 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-serif text-2xl text-emerald-900 tracking-tight">Budget &amp; simulation à 2 ans</h1>
                <p className="text-stone-500 text-sm mt-1">Connecté en tant que {session.user.email}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <label className="whitespace-nowrap">Solde de départ ({settings ? monthLabel(settings.start_month) : ""})</label>
                <input
                  type="number"
                  value={settings?.solde_initial ?? 0}
                  onChange={(e) => updateSoldeInitial(e.target.value)}
                  className="w-28 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard icon={<Wallet size={16} />} label="Solde actuel" value={formatEUR(soldeActuel)} tone={soldeActuel >= 0 ? "emerald" : "rose"} />
              <MetricCard icon={<TrendingUp size={16} />} label="Solde dans 24 mois" value={formatEUR(soldeHorizon)} tone={soldeHorizon >= 0 ? "emerald" : "rose"} />
              <MetricCard icon={<TrendingUp size={16} />} label="Revenu moyen / mois" value={formatEUR(avgRevenu)} tone="sky" />
              <MetricCard icon={<TrendingDown size={16} />} label="Dépense moyenne / mois" value={formatEUR(avgDepense)} tone="amber" />
            </div>

            <div className="bg-white rounded-lg border border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-2">Solde cumulé</p>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} interval={2} axisLine={{ stroke: "#e7e5e4" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${Math.round(v / 1000)}k€`} />
                    <Tooltip formatter={(v) => formatEUR(v)} labelStyle={{ color: "#1c1917" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }} />
                    <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="solde" stroke="#047857" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-2">Dépenses et recettes du mois (valeur absolue)</p>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} interval={2} axisLine={{ stroke: "#e7e5e4" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${Math.round(v / 1000)}k€`} />
                    <Tooltip formatter={(v) => formatEUR(v)} labelStyle={{ color: "#1c1917" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="recettes" name="Recettes" fill="#0d9488" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="depenses" name="Dépenses" fill="#e11d48" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p className="text-xs text-stone-400">Synchronisé en temps réel entre tous les comptes autorisés. Détail et saisie des écritures dans l'onglet Écritures.</p>
          </div>
        )}

        {activeTab === "settings" && (
          <SettingsTab
            categories={categories}
            entries={entries}
            settings={settings}
            onAddCategory={addCategory}
            onUpdateCategory={updateCategory}
            onRemoveCategory={removeCategory}
            onUpdateDisplaySetting={updateDisplaySetting}
          />
        )}
      </main>
    </div>
  );
}

function MonthPicker({ months, activeIdx, setActiveIdx }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-stone-700">Mois</h2>
        <div className="flex gap-1">
          <button onClick={() => setActiveIdx((i) => Math.max(0, i - 1))} className="p-1.5 rounded-md border border-stone-300 hover:bg-stone-100 disabled:opacity-40" disabled={activeIdx === 0} aria-label="Mois précédent">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setActiveIdx((i) => Math.min(MONTH_COUNT - 1, i + 1))} className="p-1.5 rounded-md border border-stone-300 hover:bg-stone-100 disabled:opacity-40" disabled={activeIdx === MONTH_COUNT - 1} aria-label="Mois suivant">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {months.map((m, i) => (
          <button key={m} onClick={() => setActiveIdx(i)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${i === activeIdx ? "bg-emerald-800 text-white border-emerald-800" : "bg-white text-stone-600 border-stone-300 hover:bg-stone-100"}`}>
            {monthLabel(m, true)}
          </button>
        ))}
      </div>
    </div>
  );
}

function DailyView({ month, entries, categoryById, settings, startBalance }) {
  const rows = useMemo(() => {
    if (!month) return [];
    const displayEntries = entries.filter((e) => e.active || settings?.show_inactive_entries);
    const byDay = {};
    displayEntries.forEach((e) => {
      const occ = entryOccurrencesInMonth(e, month);
      const countsInCalc = e.active || settings?.include_inactive_in_calcs;
      occ.forEach((d) => {
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push({ entry: e, countsInCalc });
      });
    });
    const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
    let running = startBalance;
    return days.map((d) => {
      const dayItems = byDay[d];
      const dayNet = dayItems.reduce((sum, { entry, countsInCalc }) => {
        if (!countsInCalc) return sum;
        const sign = entry.type === "credit" ? 1 : -1;
        return sum + sign * Number(entry.amount);
      }, 0);
      running += dayNet;
      return { day: d, items: dayItems, balanceAfter: running };
    });
  }, [month, entries, settings, startBalance]);

  if (!month) return null;

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <h3 className="font-serif text-lg text-stone-800">{monthLabel(month)}</h3>
        <p className="text-xs text-stone-500">
          Solde en entrée du mois : <span className="font-mono">{formatEUR(startBalance)}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-400 py-8 text-center">Aucune écriture ce mois-ci.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="px-4 py-2 font-medium w-16">Jour</th>
              <th className="px-4 py-2 font-medium">Écritures</th>
              <th className="px-4 py-2 font-medium text-right w-32">Solde cumulé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row) => (
              <tr key={row.day}>
                <td className="px-4 py-3 align-top font-mono text-stone-600">{row.day}</td>
                <td className="px-4 py-3 align-top">
                  <ul className="space-y-1.5">
                    {row.items.map(({ entry: e, countsInCalc }) => {
                      const cat = categoryById[e.category_id];
                      const isCredit = e.type === "credit";
                      return (
                        <li key={`${e.id}-${row.day}`} className={`flex items-center gap-2 ${!e.active ? "opacity-50" : ""}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 bg-${cat?.color || "stone"}-500`} />
                          <span className="text-stone-800">{e.label}</span>
                          <span className="text-stone-400 text-xs">{cat?.name}</span>
                          {!countsInCalc && <span className="text-[10px] text-stone-400 border border-stone-200 rounded px-1">exclu du calcul</span>}
                          <span className={`ml-auto font-mono text-xs ${isCredit ? "text-emerald-700" : "text-rose-700"}`}>
                            {isCredit ? "+" : "-"}{formatEUR(Number(e.amount))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </td>
                <td className={`px-4 py-3 align-top text-right font-mono ${row.balanceAfter >= 0 ? "text-stone-800" : "text-rose-700"}`}>
                  {formatEUR(row.balanceAfter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EntriesManager({ entries, categories, categoryById, months, settings, onSave, onDelete }) {
  const [filterCat, setFilterCat] = useState(null);
  const [editingEntry, setEditingEntry] = useState(undefined); // undefined = closed, null = create, obj = edit
  const displayEntries = useMemo(() => {
    let list = entries.filter((e) => e.active || settings?.show_inactive_entries);
    if (settings?.hide_obsolete_entries) {
      const currentMonthStart = todayMonthKey();
      list = list.filter((e) => !isObsolete(e, currentMonthStart));
    }
    return list;
  }, [entries, settings]);

  const counts = useMemo(() => {
    const m = {};
    displayEntries.forEach((e) => { m[e.category_id] = (m[e.category_id] || 0) + 1; });
    return m;
  }, [displayEntries]);

  const filtered = filterCat ? displayEntries.filter((e) => e.category_id === filterCat) : displayEntries;
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.month.localeCompare(b.month) || (a.day || 1) - (b.day || 1)),
    [filtered]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <aside className="sm:w-64 shrink-0 space-y-1">
        <button
          onClick={() => setFilterCat(null)}
          className={`w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-md ${
            filterCat === null ? "bg-emerald-800 text-white" : "bg-white text-stone-700 hover:bg-stone-100 border border-stone-200"
          }`}
        >
          <span>Toutes les catégories</span>
          <span className={filterCat === null ? "text-emerald-100" : "text-stone-400"}>{displayEntries.length}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCat(c.id)}
            className={`w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-md ${
              filterCat === c.id ? "bg-emerald-800 text-white" : "bg-white text-stone-700 hover:bg-stone-100 border border-stone-200"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 bg-${c.color}-500`} />
              <span className="truncate">{c.name}</span>
            </span>
            <span className={filterCat === c.id ? "text-emerald-100" : "text-stone-400"}>{counts[c.id] || 0}</span>
          </button>
        ))}
      </aside>

      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex justify-end">
          <button
            onClick={() => setEditingEntry(null)}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-800 text-white px-3 py-1.5 rounded-md hover:bg-emerald-900"
          >
            <Plus size={14} /> Ajouter une écriture
          </button>
        </div>
        <div className="bg-white rounded-lg border border-stone-200 overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="text-sm text-stone-400 py-8 text-center">Aucune écriture.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                  <th className="px-4 py-2 font-medium">Libellé</th>
                  <th className="px-4 py-2 font-medium">Catégorie</th>
                  <th className="px-4 py-2 font-medium text-right">Montant</th>
                  <th className="px-4 py-2 font-medium">Périodicité</th>
                  <th className="px-4 py-2 font-medium">Jusqu'à</th>
                  <th className="px-4 py-2 font-medium">Mois</th>
                  <th className="px-4 py-2 font-medium">Actif</th>
                  <th className="px-4 py-2 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sorted.map((e) => {
                  const cat = categoryById[e.category_id];
                  const isCredit = e.type === "credit";
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setEditingEntry(e)}
                      className={`cursor-pointer hover:bg-stone-50 ${!e.active ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2.5 text-stone-800">{e.label}</td>
                      <td className="px-4 py-2.5 text-stone-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full bg-${cat?.color || "stone"}-500`} />
                          {cat?.name || "—"}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${isCredit ? "text-emerald-700" : "text-rose-700"}`}>
                        {isCredit ? "+" : "-"}{formatEUR(Number(e.amount))}
                      </td>
                      <td className="px-4 py-2.5 text-stone-500 text-xs">{e.periodicity}</td>
                      <td className="px-4 py-2.5 text-stone-500 text-xs">{e.recurring_end ? monthLabel(e.recurring_end, true) : "—"}</td>
                      <td className="px-4 py-2.5 text-stone-500 text-xs">{monthLabel(e.month, true)} · j.{e.day || 1}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${e.active ? "text-emerald-700 bg-emerald-50" : "text-stone-500 bg-stone-100"}`}>
                          {e.active ? "Oui" : "Non"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-stone-300">
                        <Pencil size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingEntry !== undefined && (
        <EntryModal
          entry={editingEntry}
          categories={categories}
          months={months}
          onCancel={() => setEditingEntry(undefined)}
          onSave={async (fields) => {
            const ok = await onSave(fields, editingEntry?.id);
            if (ok) setEditingEntry(undefined);
          }}
          onDelete={editingEntry ? async () => { await onDelete(editingEntry.id); setEditingEntry(undefined); } : null}
        />
      )}
    </div>
  );
}

function EntryModal({ entry, categories, months, onCancel, onSave, onDelete }) {
  const isNew = !entry;
  const [label, setLabel] = useState(entry?.label || "");
  const [categoryId, setCategoryId] = useState(entry?.category_id || categories[0]?.id || "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [type, setType] = useState(entry?.type || "debit");
  const [month, setMonth] = useState(entry?.month || todayMonthKey());
  const [day, setDay] = useState(entry?.day || 1);
  const [periodicity, setPeriodicity] = useState(entry?.periodicity || "Aucune");
  const [recurringEnd, setRecurringEnd] = useState(entry?.recurring_end || addMonths(entry?.month || todayMonthKey(), 11));
  const [active, setActive] = useState(entry ? entry.active : true);
  const [error, setError] = useState("");
  const showEnd = periodicity !== "Aucune" && periodicity !== "PayPal 4x";

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-20">
      <div className="bg-white rounded-lg border border-stone-200 p-4 space-y-3 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-stone-700">{isNew ? "Nouvelle écriture" : "Modifier l'écriture"}</h4>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-700" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Libellé</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Catégorie</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="debit">Débit (dépense)</option>
              <option value="credit">Crédit (recette)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Montant (€)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Jour du mois</label>
            <input type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Mois de départ</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Périodicité</label>
            <select value={periodicity} onChange={(e) => setPeriodicity(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {PERIODICITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          {showEnd && (
            <div>
              <label className="text-xs text-stone-500 block mb-1">Jusqu'à (optionnel)</label>
              <input type="month" value={recurringEnd} onChange={(e) => setRecurringEnd(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          )}
          <div className="sm:col-span-2 flex items-center gap-1.5 pt-1">
            <input type="checkbox" id="active-checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <label htmlFor="active-checkbox" className="text-xs text-stone-600">Écriture active (prise en compte selon les réglages de Paramétrage)</label>
          </div>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          {onDelete ? (
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 px-2 py-1.5">
              <Trash2 size={14} /> Supprimer
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded-md border border-stone-300 hover:bg-stone-100">Annuler</button>
            <button
              onClick={() => {
                const amt = parseFloat(amount);
                const d = parseInt(day, 10);
                if (!label.trim()) { setError("Entrez un libellé."); return; }
                if (!(amt > 0)) { setError("Entrez un montant supérieur à 0."); return; }
                if (!(d >= 1 && d <= 31)) { setError("Le jour doit être entre 1 et 31."); return; }
                if (!categoryId) { setError("Choisissez une catégorie."); return; }
                onSave({ label: label.trim(), categoryId, amount: amt, type, month, day: d, periodicity, recurringEnd: showEnd ? recurringEnd : null, active });
              }}
              className="px-3 py-1.5 text-sm rounded-md bg-emerald-800 text-white hover:bg-emerald-900"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full bg-${c}-500 ${value === c ? "ring-2 ring-offset-1 ring-stone-800" : ""}`}
          aria-label={c}
        >
          {value === c && <Check size={12} className="text-white mx-auto" />}
        </button>
      ))}
    </div>
  );
}

function SettingsTab({ categories, entries, settings, onAddCategory, onUpdateCategory, onRemoveCategory, onUpdateDisplaySetting }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [error, setError] = useState("");

  return (
    <div className="max-w-3xl mx-auto p-5 sm:p-8 space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-stone-700 tracking-tight">Paramétrage</h1>
        <p className="text-stone-500 text-sm mt-1">Catégories et options d'affichage / calcul.</p>
      </div>

      <div className="bg-white rounded-lg border border-stone-300 p-4 space-y-4">
        <h2 className="text-sm font-medium text-stone-700">Catégories</h2>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border border-stone-200 rounded-md p-2.5">
              <input
                value={c.name}
                onChange={(e) => onUpdateCategory(c.id, { name: e.target.value })}
                className="flex-1 min-w-0 px-2 py-1 rounded border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <ColorPicker value={c.color} onChange={(color) => onUpdateCategory(c.id, { color })} />
              <button
                onClick={async () => {
                  const ok = await onRemoveCategory(c.id);
                  if (!ok) setError(`"${c.name}" est utilisée par des écritures : réaffectez-les avant de la supprimer.`);
                  else setError("");
                }}
                className="text-stone-400 hover:text-rose-600 shrink-0"
                aria-label={`Supprimer ${c.name}`}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {categories.length === 0 && <p className="text-sm text-stone-400 py-2">Aucune catégorie pour l'instant.</p>}
        </ul>

        <div className="border-t border-stone-100 pt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Nouvelle catégorie</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom" className="px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Couleur</label>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </div>
          <button
            onClick={() => { if (newName.trim()) { onAddCategory(newName.trim(), newColor); setNewName(""); } }}
            className="px-3 py-1.5 text-sm rounded-md border border-stone-400 text-stone-700 hover:bg-stone-100"
          >
            <Plus size={14} className="inline -mt-0.5 mr-1" />Ajouter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-300 p-4 space-y-3">
        <h2 className="text-sm font-medium text-stone-700">Options d'affichage et de calculs</h2>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={!!settings?.show_inactive_entries}
            onChange={(e) => onUpdateDisplaySetting("show_inactive_entries", e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-stone-700">
            Afficher les écritures inactives dans les listes (Écritures, Vue mensuelle)
            <span className="block text-xs text-stone-400">Si décoché, seules les écritures actives sont visibles.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={!!settings?.include_inactive_in_calcs}
            onChange={(e) => onUpdateDisplaySetting("include_inactive_in_calcs", e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-stone-700">
            Inclure les écritures inactives dans les calculs de budget
            <span className="block text-xs text-stone-400">Solde, graphiques et moyennes. Décoché par défaut.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={!!settings?.hide_obsolete_entries}
            onChange={(e) => onUpdateDisplaySetting("hide_obsolete_entries", e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-stone-700">
            Masquer les écritures obsolètes dans Écritures
            <span className="block text-xs text-stone-400">
              Une écriture "Jusqu'à" antérieure au mois en cours, ou ponctuelle avec un mois de départ passé, est considérée obsolète.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, tone }) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-3.5">
      <div className={`flex items-center gap-1.5 text-${tone}-700 mb-1.5`}>
        {icon}
        <span className="text-xs text-stone-500">{label}</span>
      </div>
      <p className="font-mono text-lg text-stone-900">{value}</p>
    </div>
  );
}
