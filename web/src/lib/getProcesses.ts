import { createClient } from "@/lib/supabase/server";
import type { Process } from "@/lib/types";

export function envMissing() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_PROJECT")
  );
}

export async function getProcesses(): Promise<Process[]> {
  if (envMissing()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("processes")
    .select("*")
    .order("sort_order");
  return (data ?? []) as Process[];
}
