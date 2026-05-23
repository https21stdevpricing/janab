import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { importTallyXml, importZohoCsv, type ImportReport } from "@/lib/import-external";
import { FileUp, Workflow } from "lucide-react";

export const Route = createFileRoute("/app/import")({ component: ImportPage });

function ImportPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const runTally = async (file?: File) => {
    if (!file) return;
    setBusy("Reading Tally XML…");
    try {
      const text = await file.text();
      const r = await importTallyXml(text);
      setReport(r);
      toast.success("Tally import finished");
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(null);
    }
  };
  const runZoho = async (file?: File) => {
    if (!file) return;
    setBusy("Reading Zoho file…");
    try {
      const r = await importZohoCsv(file);
      setReport(r);
      toast.success("Zoho import finished");
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import from other software"
        description="Bring your books over from Tally ERP or Zoho Books. Files are parsed locally — nothing leaves your device until the rows are written to your backend."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ImportCard
          icon={<Workflow className="h-5 w-5 text-primary" />}
          title="Tally ERP 9 / Prime"
          desc="Day Book or Masters XML export. Picks up Ledgers (parties), Stock Items (products) and Vouchers (sales / purchases / receipts / payments)."
          accept=".xml"
          onPick={runTally}
          hint="In Tally: Gateway → Display → Day Book → Alt+E → Export → Format: XML."
          busy={busy}
        />
        <ImportCard
          icon={<FileUp className="h-5 w-5 text-primary" />}
          title="Zoho Books"
          desc="CSV / XLSX exports for Items, Contacts, Invoices, Bills or Payments. The file type is detected automatically from the column names."
          accept=".csv,.xlsx"
          onPick={runZoho}
          hint="In Zoho Books: open any module → ⋮ menu → Export → choose CSV."
          busy={busy}
        />
      </div>

      {report && (
        <div className="surface mt-4 p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight">
              Import report · {report.source}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setReport(null)}>Dismiss</Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Stat label="Parsed from file" value={report.parsed} />
            <Stat label="Inserted into backend" value={report.inserted} />
          </div>
          {report.errors.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <div className="font-semibold text-destructive mb-1">Skipped rows ({report.errors.length})</div>
              <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
                {report.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: Record<string, number> }) {
  const entries = Object.entries(value);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {entries.length === 0 ? (
        <div className="mt-1 text-xs text-muted-foreground">—</div>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ImportCard({
  icon, title, desc, accept, onPick, hint, busy,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accept: string;
  onPick: (file?: File) => void;
  hint: string;
  busy: string | null;
}) {
  return (
    <div className="surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      <label className="block">
        <span className="sr-only">Choose file</span>
        <input
          type="file"
          accept={accept}
          disabled={!!busy}
          onChange={(e) => onPick(e.target.files?.[0])}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:font-medium file:cursor-pointer"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">{busy ?? hint}</p>
    </div>
  );
}