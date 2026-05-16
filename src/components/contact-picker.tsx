import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type C = { id: string; name: string; type: string };

export function ContactPicker({
  value, onChange, filter,
}: {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  filter?: "buyer" | "supplier";
}) {
  const [rows, setRows] = useState<C[]>([]);
  useEffect(() => {
    let q = supabase.from("contacts").select("id,name,type").order("name");
    if (filter === "buyer") q = q.in("type", ["buyer", "both"]);
    else if (filter === "supplier") q = q.in("type", ["supplier", "both"]);
    q.then(({ data }) => setRows((data ?? []) as C[]));
  }, [filter]);
  return (
    <Select value={value ?? ""} onValueChange={(v) => { const r = rows.find(x => x.id === v); onChange(v || null, r?.name ?? null); }}>
      <SelectTrigger className="h-9"><SelectValue placeholder={`Select ${filter ?? "contact"}`} /></SelectTrigger>
      <SelectContent>{rows.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}