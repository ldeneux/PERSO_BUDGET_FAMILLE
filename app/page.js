"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      router.replace(data?.session ? "/budget" : "/login");
    })();
  }, [router]);

  return (
    <div className="w-full min-h-screen flex items-center justify-center text-stone-400 text-sm font-sans">
      Chargement…
    </div>
  );
}
