import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/app/ledger")({ component: LedgerPage });

function LedgerPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [account, setAccount] = useState<string>("__all__");
  useEffect(() => { supabase.from("ledger_view").select("*").order("date", { ascending: true }).then(({ data }) => setRows(data ?? [])); }, []);

  const accounts = useMemo(() => Array.from(new Set(rows.map(r => r.account))).sort(), [rows]);
  const filtered = useMemo(() => account === "__all__" ? rows : rows.filter(r => r.account === account), [rows, account]);

  let running = 0;
  return (
    <div>
      <PageHeader title="General Ledger" description="Every double-entry posting from your books" actions={
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      } />
      {filtered.length === 0 ? <Empty>No postings yet.</Empty> : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-2 w-24">Date</th>
                <th className="text-left p-2 w-28">Source</th>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2">Party</th>
                <th className="text-left p-2">Narration</th>
                <th className="text-right p-2 w-24">Debit</th>
                <th className="text-right p-2 w-24">Credit</th>
                {account !== "__all__" && <th className="text-right p-2 w-24">Balance</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                running += Number(r.debit ?? 0) - Number(r.credit ?? 0);
                return (
                  <tr key={i} className="border-t">
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="p-2 font-mono text-xs">{r.source_id}</td>
                    <td className="p-2">{r.account}</td>
                    <td className="p-2 truncate max-w-[140px]">{r.party}</td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">{r.narration}</td>
                    <td className="p-2 text-right tabular-nums">{Number(r.debit ?? 0) ? fmt(r.debit) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{Number(r.credit ?? 0) ? fmt(r.credit) : ""}</td>
                    {account !== "__all__" && <td className="p-2 text-right tabular-nums font-medium">{fmt(running)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}