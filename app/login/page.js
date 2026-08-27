"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Entrez votre email et votre mot de passe.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError("Connexion refusée. Vérifiez l'email et le mot de passe.");
      return;
    }
    router.replace("/budget");
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-stone-50 font-sans px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-stone-200 rounded-xl p-6 space-y-4"
      >
        <div>
          <h1 className="font-serif text-xl text-emerald-900">Budget famille</h1>
          <p className="text-stone-500 text-sm mt-1">Connectez-vous pour accéder au budget partagé.</p>
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@exemple.fr"
            className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-md bg-emerald-800 text-white text-sm font-medium hover:bg-emerald-900 disabled:opacity-60"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
        <p className="text-xs text-stone-400">
          Pas de compte ? Les comptes sont créés manuellement depuis le tableau de bord Supabase — voir le README.
        </p>
      </form>
    </div>
  );
}
