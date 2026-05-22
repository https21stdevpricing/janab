import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate } from "@/lib/format";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useLiveSync } from "@/hooks/use-live-sync";
import { fetchAllPages } from "@/lib/fetch-all-pages";

export const Route = createFileRoute("/app/ledger")({ component: LedgerPage });

const LEDGER_LIVE_TABLES = [
  "journal_lines",
  "journal_entries",
  "sales",
  "purchases",
  "third_party",
  "payments",
  "payment_allocations",
  "expenses",
  "bank_transfers",
  "fixed_assets",
  "stock_adjustments",
];

const SIDE_VALUES = ["all", "debit", "credit"] as const;
const SORT_BY_VALUES = ["date", "amount", "account"] as const;
const SORT_DIR_VALUES = ["desc", "asc"] as const;

type LedgerRow = {
  user_id: string | null;
  date: string | null;
  account: string | null;
  party: string | null;
  ref_no: string | null;
  narration: string | null;
  source_id?: string | null;
  debit: number | null;
  credit: number | null;
};

function LedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [account, setAccount] = useState<string>("__all__");
  const [party, setParty] = useState("");
  const [refQ, setRefQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [side, setSide] = useState<"all" | "debit" | "credit">("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "account">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  const loadRows = useCallback(async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setRows([]);
      return;
    }
    const data = await fetchAllPages<LedgerRow>(
      (from, to) =>
        supabase
          .from("ledger_view")
          .select("*")
          .eq("user_id", auth.user.id)
          .order("date", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: LedgerRow[] | null;
          error: { message: string } | null;
        }>,
    );
    setRows(data);
  }, []);
  const { isLive, isRefreshing, lastSyncedAt, lastError, refresh } = useLiveSync({
    channelName: "ledger-live",
    tables: LEDGER_LIVE_TABLES,
    load: loadRows,
  });

  const accounts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.account).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if (account !== "__all__" && r.account !== account) return false;
      if (party && !(r.party ?? "").toLowerCase().includes(party.toLowerCase())) return false;
      if (refQ && !(r.ref_no ?? "").toLowerCase().includes(refQ.toLowerCase())) return false;
      if (from && (r.date ?? "") < from) return false;
      if (to && (r.date ?? "") > to) return false;
      if (side === "debit" && !Number(r.debit)) return false;
      if (side === "credit" && !Number(r.credit)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      if (sortBy === "date") {
        va = a.date ?? "";
        vb = b.date ?? "";
      } else if (sortBy === "account") {
        va = a.account ?? "";
        vb = b.account ?? "";
      } else {
        va = Number(a.debit || 0) - Number(a.credit || 0);
        vb = Number(b.debit || 0) - Number(b.credit || 0);
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return out;
  }, [rows, account, party, refQ, from, to, side, sortBy, sortDir]);

  const totals = useMemo(() => {
    let d = 0,
      c = 0;
    for (const r of filtered) {
      d += Number(r.debit || 0);
      c += Number(r.credit || 0);
    }
    return { d, c, net: d - c };
  }, [filtered]);

  const resetFilters = () => {
    setAccount("__all__");
    setParty("");
    setRefQ("");
    setFrom("");
    setTo("");
    setSide("all");
    setSortBy("date");
    setSortDir("desc");
  };

  // Export always start→end (chronological asc) regardless of on-screen sort
  const exportRows = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        (a.date ?? "") < (b.date ?? "") ? -1 : (a.date ?? "") > (b.date ?? "") ? 1 : 0,
      ),
    [filtered],
  );
  let running = 0;
  const onExport = () =>
    exportToExcel({
      filename: `ledger-${account === "__all__" ? "all" : account.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Ledger",
      columns: [
        { header: "Date", key: "date" },
        { header: "Account", key: "account" },
        { header: "Party", key: "party" },
        { header: "Ref", key: "ref_no" },
        { header: "Narration", key: "narration" },
        { header: "Debit", key: "debit" },
        { header: "Credit", key: "credit" },
      ],
      rows: exportRows,
    });

  return (
    <div>
      <PageHeader
        title="General Ledger"
        description={`Every double-entry posting · ${isLive ? "live" : "syncing"}${lastSyncedAt ? ` · updated ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? "Syncing…" : "Refresh"}
            </Button>
            <ExcelBar onExport={onExport} />
          </div>
        }
      />
      {lastError && (
        <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Ledger sync failed: {lastError.message}
        </div>
      )}

      {/* Filter toggle */}
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters((s) => !s)}
        >
          <Filter className="h-4 w-4" /> Filters{" "}
          {showFilters ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
        {(account !== "__all__" || party || refQ || from || to || side !== "all") && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} rows · sort: {sortBy} {sortDir}
        </div>
      </div>

      {/* Filters (collapsible) */}
      {showFilters && (
        <div className="rounded-md border bg-card p-3 mb-3 grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="space-y-1 col-span-2 md:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Party</Label>
            <Input
              className="h-8"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="name…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Ref</Label>
            <Input
              className="h-8 font-mono"
              value={refQ}
              onChange={(e) => setRefQ(e.target.value)}
              placeholder="INV-0001"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
            <Input
              className="h-8"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
            <Input className="h-8" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Side</Label>
            <Select
              value={side}
              onValueChange={(v) => {
                if (SIDE_VALUES.includes(v as (typeof SIDE_VALUES)[number])) {
                  setSide(v as (typeof SIDE_VALUES)[number]);
                }
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="debit">Debit only</SelectItem>
                <SelectItem value="credit">Credit only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Sort by</Label>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                if (SORT_BY_VALUES.includes(v as (typeof SORT_BY_VALUES)[number])) {
                  setSortBy(v as (typeof SORT_BY_VALUES)[number]);
                }
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="amount">Amount (debit − credit)</SelectItem>
                <SelectItem value="account">Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Direction</Label>
            <Select
              value={sortDir}
              onValueChange={(v) => {
                if (SORT_DIR_VALUES.includes(v as (typeof SORT_DIR_VALUES)[number])) {
                  setSortDir(v as (typeof SORT_DIR_VALUES)[number]);
                }
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending (latest first)</SelectItem>
                <SelectItem value="asc">Ascending (oldest first)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" className="h-8 w-full" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-border/70 bg-card p-3 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Debit</div>
          <div className="text-[15px] sm:text-base font-semibold tabular-nums truncate">
            {fmt(totals.d)}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Credit
          </div>
          <div className="text-[15px] sm:text-base font-semibold tabular-nums truncate">
            {fmt(totals.c)}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/70 bg-card p-3 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Net</div>
          <div
            className={`text-[15px] sm:text-base font-semibold tabular-nums truncate ${totals.net >= 0 ? "text-primary" : "text-destructive"}`}
          >
            {fmt(totals.net)}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>No postings yet.</Empty>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-2 w-24">Date</th>
                <th className="text-left p-2 w-28">Source</th>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2">Party</th>
                <th className="text-left p-2 w-24">Ref</th>
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
                    <td className="p-2 whitespace-nowrap">{r.date ? fmtDate(r.date) : ""}</td>
                    <td className="p-2 font-mono text-xs">{r.source_id}</td>
                    <td className="p-2">{r.account}</td>
                    <td className="p-2 truncate max-w-[140px]">{r.party}</td>
                    <td className="p-2 font-mono text-xs">
                      {r.ref_no ? (
                        <Link
                          to="/app/lookup"
                          search={{ q: r.ref_no }}
                          className="text-primary hover:underline"
                        >
                          {r.ref_no}
                        </Link>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">
                      {r.narration}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(r.debit ?? 0) ? fmt(r.debit) : ""}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(r.credit ?? 0) ? fmt(r.credit) : ""}
                    </td>
                    {account !== "__all__" && (
                      <td className="p-2 text-right tabular-nums font-medium">{fmt(running)}</td>
                    )}
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
