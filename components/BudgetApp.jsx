"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
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
  Tag,
  X,
  LogOut,
  LayoutGrid,
  CalendarDays,
  List,
  Pencil,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const MONTH_COUNT = 24;
const PALETTE = ["emerald", "amber", "rose", "sky", "violet", "orange", "teal", "fuchsia"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

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

const DEFAULT_CATEGORIES = [
  { name: "Loyers perçus", type: "revenu", color: "emerald" },
  { name: "Salaires", type: "revenu", color: "sky" },
  { name: "Charges logement", type: "depense", color: "amber" },
  { name: "Prêts immobiliers", type: "depense", color: "rose" },
  { name: "Taxes foncières", type: "depense", color: "orange" },
  { name: "Assurances", type: "depense", color: "violet" },
  { name: "Vacances / loisirs", type: "depense", color: "fuchsia" },
  { name: "Divers", type: "depense", color: "teal" },
];

const NAV_ITEMS = [
  { key: "simulation", label: "Simulation budgétaire 24 mois", icon: LayoutGrid },
  { key: "monthly", label: "Vue mensuelle", icon: CalendarDays },
  { key: "entries", label: "Écritures", icon: List },
];

export default function BudgetApp({ session }) {
  const [activeTab, setActiveTab] = useState("simulation");
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [{ data: s }, { data: cats }, { data: ents }] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("categories").select("*").order("created_at", { ascending: true }),
        supabase.from("entries").select("*").order("month", { ascending: true }),
      ]);

      if (!s) {
        const startMonth = todayMonthKey();
        await supabase.from("settings").insert({ id: 1, solde_initial: 0, start_month: startMonth });
        setSettings({ solde_initial: 0, start_month: startMonth });
      } else {
        setSettings(s);
      }

      if (!cats || cats.length === 0) {
        const { data: inserted } = await supabase.from("categories").insert(DEFAULT_CATEGORIES).select();
        setCategories(inserted || []);
      } else {
        setCategories(cats);
      }

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

  function entriesForMonth(month) {
    return entries.filter((e) =>
      e.recurring_end ? month >= e.month && month <= e.recurring_end : month === e.month
    );
  }
  function netForMonth(month) {
    return entriesForMonth(month).reduce((sum, e) => {
      const cat = categoryById[e.category_id];
      const sign = cat && cat.type === "revenu" ? 1 : -1;
      return sum + sign * Number(e.amount);
    }, 0);
  }

  const chartData = useMemo(() => {
    if (!settings) return [];
    let bal = Number(settings.solde_initial) || 0;
    return months.map((m) => {
      bal += netForMonth(m);
      return { month: m, label: monthLabel(m, true), solde: Math.round(bal), soldeFin: bal };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, months, entries, categories]);

  const soldeActuel = chartData[0] ? chartData[0].solde : 0;
  const soldeHorizon = chartData[MONTH_COUNT - 1] ? chartData[MONTH_COUNT - 1].solde : 0;
  const avgRevenu = months.length
    ? months.reduce((sum, m) => sum + entriesForMonth(m).filter((e) => categoryById[e.category_id]?.type === "revenu").reduce((s, e) => s + Number(e.amount), 0), 0) / months.length
    : 0;
  const avgDepense = months.length
    ? months.reduce((sum, m) => sum + entriesForMonth(m).filter((e) => categoryById[e.category_id]?.type === "depense").reduce((s, e) => s + Number(e.amount), 0), 0) / months.length
    : 0;

  // Balance carried into the start of the currently selected month (before that month's own entries)
  const soldeDebutMoisActif = useMemo(() => {
    if (!settings) return 0;
    if (activeIdx === 0) return Number(settings.solde_initial) || 0;
    return chartData[activeIdx - 1] ? chartData[activeIdx - 1].soldeFin : Number(settings.solde_initial) || 0;
  }, [settings, chartData, activeIdx]);

  if (loading) {
    return <div className="w-full min-h-screen flex items-center justify-center text-stone-400 text-sm font-sans">Chargement du budget…</div>;
  }

  const activeMonth = months[activeIdx];
  const activeEntries = entriesForMonth(activeMonth);

  async function addEntry(entry) {
    const { error } = await supabase.from("entries").insert({
      category_id: entry.categoryId,
      label: entry.label,
      amount: entry.amount,
      month: entry.month,
      day: entry.day,
      recurring_end: entry.recurringEnd,
    });
    if (error) setErrorMsg("Impossible d'ajouter cette entrée.");
    else fetchAll();
  }
  async function deleteEntry(id) {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) setErrorMsg("Impossible de supprimer cette entrée.");
    else fetchAll();
  }
  async function updateEntryRow(id, fields) {
    const { error } = await supabase
      .from("entries")
      .update({
        category_id: fields.categoryId,
        label: fields.label,
        amount: fields.amount,
        month: fields.month,
        day: fields.day,
        recurring_end: fields.recurringEnd,
      })
      .eq("id", id);
    if (error) { setErrorMsg("Impossible de modifier cette entrée."); return false; }
    fetchAll();
    return true;
  }
  async function addCategory(name, type, color) {
    const { error } = await supabase.from("categories").insert({ name, type, color });
    if (error) setErrorMsg("Impossible d'ajouter cette catégorie.");
    else fetchAll();
  }
  async function removeCategory(id) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      setErrorMsg("Cette catégorie est utilisée par des entrées : supprimez-les d'abord.");
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
        </nav>
        <button onClick={logout} className="flex items-center gap-2 text-sm text-stone-500 px-3 py-2 rounded-md hover:bg-stone-200">
          <LogOut size={16} /> Déconnexion
        </button>
      </aside>

      {/* Mobile tab bar */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-stone-100 border-t border-stone-200 flex z-10">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[11px] ${active ? "text-emerald-800" : "text-stone-500"}`}
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

            <MonthPicker months={months} activeIdx={activeIdx} setActiveIdx={setActiveIdx} />

            <div className="bg-white rounded-lg border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-lg text-stone-800">{activeMonth ? monthLabel(activeMonth) : ""}</h3>
                <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs font-medium bg-emerald-800 text-white px-3 py-1.5 rounded-md hover:bg-emerald-900">
                  <Plus size={14} /> Ajouter
                </button>
              </div>

              {activeEntries.length === 0 ? (
                <p className="text-sm text-stone-400 py-4 text-center">Aucune entrée pour ce mois.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {activeEntries.map((e) => {
                    const cat = categoryById[e.category_id];
                    const isRevenu = cat?.type === "revenu";
                    return (
                      <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 bg-${cat?.color || "stone"}-500`} />
                          <div className="min-w-0">
                            <p className="text-sm text-stone-800 truncate">{e.label}</p>
                            <p className="text-xs text-stone-400">
                              {cat?.name || "Sans catégorie"} · jour {e.day || 1}
                              {e.recurring_end ? ` · récurrent jusqu'à ${monthLabel(e.recurring_end, true)}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`font-mono text-sm ${isRevenu ? "text-emerald-700" : "text-rose-700"}`}>
                            {isRevenu ? "+" : "-"}{formatEUR(Number(e.amount))}
                          </span>
                          <button onClick={() => deleteEntry(e.id)} className="text-stone-400 hover:text-rose-600" aria-label="Supprimer">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {showForm && (
              <EntryForm
                categories={categories}
                month={activeMonth}
                onCancel={() => setShowForm(false)}
                onSubmit={(entry) => { addEntry(entry); setShowForm(false); }}
              />
            )}

            <div className="bg-white rounded-lg border border-stone-200 p-4">
              <button onClick={() => setShowCategories((v) => !v)} className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <Tag size={15} /> Catégories {showCategories ? "▲" : "▼"}
              </button>
              {showCategories && (
                <div className="mt-3">
                  <ul className="flex flex-wrap gap-2 mb-3">
                    {categories.map((c) => (
                      <li key={c.id} className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs border bg-${c.color}-50 border-${c.color}-200 text-${c.color}-800`}>
                        {c.name}
                        <span className="text-stone-400">({c.type === "revenu" ? "revenu" : "dépense"})</span>
                        <button onClick={() => removeCategory(c.id)} className="hover:text-rose-600" aria-label={`Supprimer ${c.name}`}>
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <CategoryForm onAdd={addCategory} />
                </div>
              )}
            </div>

            <p className="text-xs text-stone-400">Synchronisé en temps réel entre tous les comptes autorisés.</p>
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
              entries={activeEntries}
              categoryById={categoryById}
              startBalance={soldeDebutMoisActif}
            />
          </div>
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
              onUpdate={updateEntryRow}
              onDelete={deleteEntry}
            />
          </div>
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

function DailyView({ month, entries, categoryById, startBalance }) {
  if (!month) return null;
  const total = daysInMonth(month);

  const byDay = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      const d = e.day || 1;
      if (!map[d]) map[d] = [];
      map[d].push(e);
    });
    return map;
  }, [entries]);

  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  let running = startBalance;
  const rows = days.map((d) => {
    const dayEntries = byDay[d];
    const dayNet = dayEntries.reduce((sum, e) => {
      const cat = categoryById[e.category_id];
      const sign = cat && cat.type === "revenu" ? 1 : -1;
      return sum + sign * Number(e.amount);
    }, 0);
    running += dayNet;
    return { day: d, entries: dayEntries, balanceAfter: running };
  });

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <h3 className="font-serif text-lg text-stone-800">{monthLabel(month)}</h3>
        <p className="text-xs text-stone-500">
          Solde en entrée du mois : <span className="font-mono">{formatEUR(startBalance)}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-400 py-8 text-center">Aucune écriture ce mois-ci ({total} jours).</p>
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
                    {row.entries.map((e) => {
                      const cat = categoryById[e.category_id];
                      const isRevenu = cat?.type === "revenu";
                      return (
                        <li key={e.id} className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 bg-${cat?.color || "stone"}-500`} />
                          <span className="text-stone-800">{e.label}</span>
                          <span className="text-stone-400 text-xs">{cat?.name}</span>
                          <span className={`ml-auto font-mono text-xs ${isRevenu ? "text-emerald-700" : "text-rose-700"}`}>
                            {isRevenu ? "+" : "-"}{formatEUR(Number(e.amount))}
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

function EntriesManager({ entries, categories, categoryById, months, onUpdate, onDelete }) {
  const [filterCat, setFilterCat] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);

  const counts = useMemo(() => {
    const m = {};
    entries.forEach((e) => { m[e.category_id] = (m[e.category_id] || 0) + 1; });
    return m;
  }, [entries]);

  const filtered = filterCat ? entries.filter((e) => e.category_id === filterCat) : entries;
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
          <span className={filterCat === null ? "text-emerald-100" : "text-stone-400"}>{entries.length}</span>
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

      <div className="flex-1 min-w-0 bg-white rounded-lg border border-stone-200 overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="text-sm text-stone-400 py-8 text-center">Aucune écriture.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                <th className="px-4 py-2 font-medium">Libellé</th>
                <th className="px-4 py-2 font-medium">Catégorie</th>
                <th className="px-4 py-2 font-medium text-right">Montant</th>
                <th className="px-4 py-2 font-medium">Récurrence</th>
                <th className="px-4 py-2 font-medium">Mois</th>
                <th className="px-4 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sorted.map((e) => {
                const cat = categoryById[e.category_id];
                const isRevenu = cat?.type === "revenu";
                return (
                  <tr
                    key={e.id}
                    onClick={() => setEditingEntry(e)}
                    className="cursor-pointer hover:bg-stone-50"
                  >
                    <td className="px-4 py-2.5 text-stone-800">{e.label}</td>
                    <td className="px-4 py-2.5 text-stone-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full bg-${cat?.color || "stone"}-500`} />
                        {cat?.name || "—"}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono ${isRevenu ? "text-emerald-700" : "text-rose-700"}`}>
                      {isRevenu ? "+" : "-"}{formatEUR(Number(e.amount))}
                    </td>
                    <td className="px-4 py-2.5 text-stone-500 text-xs">
                      {e.recurring_end ? `Mensuel jusqu'à ${monthLabel(e.recurring_end, true)}` : "Ponctuel"}
                    </td>
                    <td className="px-4 py-2.5 text-stone-500 text-xs">{monthLabel(e.month, true)} · j.{e.day || 1}</td>
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

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          categories={categories}
          months={months}
          onCancel={() => setEditingEntry(null)}
          onSave={async (fields) => {
            const ok = await onUpdate(editingEntry.id, fields);
            if (ok) setEditingEntry(null);
          }}
          onDelete={async () => {
            await onDelete(editingEntry.id);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
}

function EditEntryModal({ entry, categories, months, onCancel, onSave, onDelete }) {
  const cat = categories.find((c) => c.id === entry.category_id);
  const [label, setLabel] = useState(entry.label);
  const [categoryId, setCategoryId] = useState(entry.category_id);
  const [amount, setAmount] = useState(String(entry.amount));
  const [month, setMonth] = useState(entry.month);
  const [day, setDay] = useState(entry.day || 1);
  const [recurring, setRecurring] = useState(!!entry.recurring_end);
  const [recurringEnd, setRecurringEnd] = useState(entry.recurring_end || addMonths(entry.month, 11));
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-20">
      <div className="bg-white rounded-lg border border-stone-200 p-4 space-y-3 w-full max-w-md">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-stone-700">Modifier l'écriture</h4>
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
                <option key={c.id} value={c.id}>{c.name} ({c.type === "revenu" ? "revenu" : "dépense"})</option>
              ))}
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
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Mois de départ</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs text-stone-600 pb-2">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Récurrent chaque mois
            </label>
          </div>
          {recurring && (
            <div className="sm:col-span-2">
              <label className="text-xs text-stone-500 block mb-1">Jusqu'à (inclus)</label>
              <input type="month" value={recurringEnd} onChange={(e) => setRecurringEnd(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          <button onClick={onDelete} className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 px-2 py-1.5">
            <Trash2 size={14} /> Supprimer
          </button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded-md border border-stone-300 hover:bg-stone-100">Annuler</button>
            <button
              onClick={() => {
                const amt = parseFloat(amount);
                const d = parseInt(day, 10);
                if (!label.trim()) { setError("Entrez un libellé."); return; }
                if (!(amt > 0)) { setError("Entrez un montant supérieur à 0."); return; }
                if (!(d >= 1 && d <= 31)) { setError("Le jour doit être entre 1 et 31."); return; }
                onSave({ label: label.trim(), categoryId, amount: amt, month, day: d, recurringEnd: recurring ? recurringEnd : null });
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

function EntryForm({ categories, month, onCancel, onSubmit }) {
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(1);
  const [recurring, setRecurring] = useState(false);
  const [recurringEnd, setRecurringEnd] = useState(addMonths(month, 11));
  const [error, setError] = useState("");

  return (
    <div className="bg-white rounded-lg border-2 border-emerald-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-stone-700">Nouvelle entrée · {monthLabel(month)}</h4>
        <button onClick={onCancel} className="text-stone-400 hover:text-stone-700" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-stone-500 block mb-1">Libellé</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Loyer garage Caluire" className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Catégorie</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.type === "revenu" ? "revenu" : "dépense"})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Montant (€)</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="96.53" className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Jour du mois</label>
          <input type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <label className="flex items-center gap-1.5 text-xs text-stone-600 pb-2">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Récurrent chaque mois
          </label>
        </div>
        {recurring && (
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Jusqu'à (inclus)</label>
            <input type="month" value={recurringEnd} onChange={(e) => setRecurringEnd(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded-md border border-stone-300 hover:bg-stone-100">Annuler</button>
        <button
          onClick={() => {
            const amt = parseFloat(amount);
            const d = parseInt(day, 10);
            if (!label.trim()) { setError("Entrez un libellé."); return; }
            if (!(amt > 0)) { setError("Entrez un montant supérieur à 0."); return; }
            if (!(d >= 1 && d <= 31)) { setError("Le jour doit être entre 1 et 31."); return; }
            onSubmit({ label: label.trim(), categoryId, amount: amt, month, day: d, recurringEnd: recurring ? recurringEnd : null });
          }}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-800 text-white hover:bg-emerald-900"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

function CategoryForm({ onAdd }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("depense");
  const [color, setColor] = useState(PALETTE[0]);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-xs text-stone-500 block mb-1">Nouvelle catégorie</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" className="px-2.5 py-1.5 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
      <select value={type} onChange={(e) => setType(e.target.value)} className="px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <option value="depense">Dépense</option>
        <option value="revenu">Revenu</option>
      </select>
      <select value={color} onChange={(e) => setColor(e.target.value)} className="px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
        {PALETTE.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <button
        onClick={() => { if (name.trim()) { onAdd(name.trim(), type, color); setName(""); } }}
        className="px-3 py-1.5 text-sm rounded-md border border-emerald-300 text-emerald-800 hover:bg-emerald-50"
      >
        <Plus size={14} className="inline -mt-0.5 mr-1" />Ajouter
      </button>
    </div>
  );
}
