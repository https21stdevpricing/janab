import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { seedDemoData, clearAllData } from "@/lib/seed-demo";
import { downloadFullBackup, getLastBackupAt } from "@/lib/backup";
import { Download, ShieldCheck, AlertTriangle, Users, Hash, LogOut, Trash2, Plus, ClipboardCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [backing, setBacking] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(getLastBackupAt());
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff" | "viewer">("staff");
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("settings").select("*").maybeSingle().then(({ data }) => setS(data));
    loadInvites();
  }, []);
  const loadInvites = async () => {
    const { data } = await supabase.from("team_invites" as never).select("*").order("invited_at" as never, { ascending: false }) as any;
    setInvites((data ?? []) as any[]);
  };

  const save = async () => {
    if (!s) return;
    const { error } = await supabase.from("settings").update({
      company_name: s.company_name, gstin: s.gstin, state: s.state, address: s.address,
      phone: s.phone, email: s.email, low_stock_threshold: s.low_stock_threshold,
      prefix_sale: s.prefix_sale, prefix_purchase: s.prefix_purchase, prefix_tp: s.prefix_tp,
      prefix_quote: s.prefix_quote, prefix_delivery: s.prefix_delivery, prefix_payment: s.prefix_payment,
    }).eq("user_id", s.user_id);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const seed = async () => {
    if (!confirm("Replace ALL your data with demo data?")) return;
    setSeeding(true);
    try { await seedDemoData(); toast.success("Demo data loaded"); const { data } = await supabase.from("settings").select("*").maybeSingle(); setS(data); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setSeeding(false); }
  };

  const clearAll = async () => {
    if (!confirm("This will permanently DELETE all your products, contacts, sales, purchases, payments, expenses, third-party deals and quotations.\n\nContinue?")) return;
    setClearing(true);
    try { await clearAllData(); toast.success("All data cleared"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setClearing(false); }
  };

  const runBackup = async () => {
    setBacking(true);
    try { await downloadFullBackup(); setLastBackup(getLastBackupAt()); toast.success("Backup downloaded"); }
    catch (e: any) { toast.error(e.message ?? "Backup failed"); }
    finally { setBacking(false); }
  };

  const lastDays = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;
  const stale = lastDays == null || lastDays >= 7;

  const addInvite = async () => {
    if (!inviteEmail.trim() || !/.+@.+\..+/.test(inviteEmail)) { toast.error("Enter a valid email"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("team_invites" as never).insert({
      user_id: user.id, email: inviteEmail.trim(), role: inviteRole, status: "pending",
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Invite recorded — share the sign-up link with " + inviteEmail);
    setInviteEmail(""); loadInvites();
  };
  const setInviteStatus = async (id: string, status: "accepted" | "revoked") => {
    const { error } = await supabase.from("team_invites" as never).update({ status } as never).eq("id" as never, id);
    if (error) toast.error(error.message); else loadInvites();
  };
  const removeInvite = async (id: string) => {
    const { error } = await supabase.from("team_invites" as never).delete().eq("id" as never, id);
    if (error) toast.error(error.message); else loadInvites();
  };

  const closeAccount = async () => {
    const phrase = prompt("This will mark your account as closed and sign you out. Your data is preserved for 60 days in case you change your mind.\n\nType CLOSE to confirm:");
    if (phrase !== "CLOSE") { if (phrase != null) toast.error("Cancelled — phrase did not match"); return; }
    const { error } = await supabase.from("settings").update({ account_closed_at: new Date().toISOString() } as never).eq("user_id", s.user_id);
    if (error) { toast.error(error.message); return; }
    await supabase.auth.signOut();
    toast.success("Account closed. Sign in within 60 days to reactivate.");
    navigate({ to: "/login" as any });
  };

  if (!s) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageHeader title="Settings" description="Company profile and tools" />
      <Card className="mb-4">
        <CardHeader><CardTitle>Company profile</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Company name"><Input value={s.company_name ?? ""} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></F>
          <F label="GSTIN"><Input value={s.gstin ?? ""} onChange={(e) => setS({ ...s, gstin: e.target.value })} /></F>
          <F label="State"><Input value={s.state ?? ""} onChange={(e) => setS({ ...s, state: e.target.value })} /></F>
          <F label="Phone"><Input value={s.phone ?? ""} onChange={(e) => setS({ ...s, phone: e.target.value })} /></F>
          <F label="Email"><Input value={s.email ?? ""} onChange={(e) => setS({ ...s, email: e.target.value })} /></F>
          <F label="Low-stock threshold"><Input type="number" value={s.low_stock_threshold ?? 10} onChange={(e) => setS({ ...s, low_stock_threshold: +e.target.value })} /></F>
          <F label="Address" wide><Input value={s.address ?? ""} onChange={(e) => setS({ ...s, address: e.target.value })} /></F>
          <div className="md:col-span-2"><Button onClick={save}>Save</Button></div>
        </CardContent>
      </Card>

      {/* Opening balances re-run */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" /> Opening balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Re-run the first-time setup wizard if you need to reseed opening cash, bank, stock, receivables or payables. Posts a fresh "Opening balances" voucher so trial balance stays balanced.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/onboarding" search={{ force: "1" } as any}>Run setup wizard</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Numbering & document prefixes */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Hash className="h-4 w-4" /> Numbering & document prefixes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Each document type uses its own prefix. The number that follows auto-increments per financial year. Once a document is saved, its number is locked to keep the GST series continuous.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <F label="Sale invoice"><Input className="font-mono uppercase" maxLength={6} value={s.prefix_sale ?? "INV"} onChange={(e) => setS({ ...s, prefix_sale: e.target.value.toUpperCase() })} /></F>
            <F label="Purchase"><Input className="font-mono uppercase" maxLength={6} value={s.prefix_purchase ?? "PO"} onChange={(e) => setS({ ...s, prefix_purchase: e.target.value.toUpperCase() })} /></F>
            <F label="Third-party"><Input className="font-mono uppercase" maxLength={6} value={s.prefix_tp ?? "TP"} onChange={(e) => setS({ ...s, prefix_tp: e.target.value.toUpperCase() })} /></F>
            <F label="Quotation"><Input className="font-mono uppercase" maxLength={6} value={s.prefix_quote ?? "QT"} onChange={(e) => setS({ ...s, prefix_quote: e.target.value.toUpperCase() })} /></F>
            <F label="Delivery challan"><Input className="font-mono uppercase" maxLength={6} value={s.prefix_delivery ?? "DC"} onChange={(e) => setS({ ...s, prefix_delivery: e.target.value.toUpperCase() })} /></F>
            <F label="Receipt / payment"><Input className="font-mono uppercase" maxLength={6} value={s.prefix_payment ?? "PAY"} onChange={(e) => setS({ ...s, prefix_payment: e.target.value.toUpperCase() })} /></F>
          </div>
          <div className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
            Preview · <span className="font-mono text-foreground">{(s.prefix_sale ?? "INV")}-0001</span> · <span className="font-mono text-foreground">{(s.prefix_purchase ?? "PO")}-0001</span> · <span className="font-mono text-foreground">{(s.prefix_payment ?? "PAY")}-0001</span>
          </div>
          <Button onClick={save} size="sm">Save numbering</Button>
        </CardContent>
      </Card>

      {/* Team invites */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Record people who should have access. They sign up with the same email on the login page, and every action is captured in the audit log with their name and timestamp.</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2">
            <Input type="email" placeholder="teammate@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin (full)</SelectItem>
                <SelectItem value="staff">Staff (entry)</SelectItem>
                <SelectItem value="viewer">Viewer (read-only)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addInvite}><Plus className="h-4 w-4" /> Invite</Button>
          </div>
          {invites.length > 0 && (
            <div className="rounded-md border divide-y">
              {invites.map(it => (
                <div key={it.id} className="p-2.5 flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{it.email}</div>
                    <div className="text-[11px] text-muted-foreground">{it.role} · invited {new Date(it.invited_at).toLocaleDateString()}</div>
                  </div>
                  <Badge variant={it.status === "accepted" ? "default" : it.status === "revoked" ? "destructive" : "secondary"} className="text-[10px]">{it.status}</Badge>
                  {it.status === "pending" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setInviteStatus(it.id, "accepted")}>Mark joined</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setInviteStatus(it.id, "revoked")}>Revoke</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeInvite(it.id)} title="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Backups &amp; data safety</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <div className="font-medium">How your data is protected</div>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>Cloud database with <b>automatic daily snapshots</b> retained by the platform — recoverable on request.</li>
              <li>Point-in-time restore is available for the live cloud project (contact support for restore window).</li>
              <li>Row-level security keeps your books isolated from every other user.</li>
              <li>You can pull a <b>full local copy any time</b> with the button below — one Excel file, one sheet per table.</li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runBackup} disabled={backing}>
              <Download className="h-4 w-4" /> {backing ? "Preparing…" : "Download full backup (.xlsx)"}
            </Button>
            <div className="text-xs text-muted-foreground">
              {lastBackup
                ? <>Last backup: <b>{new Date(lastBackup).toLocaleString()}</b> ({lastDays}d ago)</>
                : <>No local backup yet.</>}
            </div>
          </div>
          {stale && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div><b>Weekly backup recommended.</b> Download a fresh copy every Sunday and keep it on a different device / drive. In an emergency (accidental delete, account loss) you can re-import this Excel file sheet-by-sheet.</div>
            </div>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground font-medium">Emergency recovery checklist</summary>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Stop entering new transactions to prevent further drift.</li>
              <li>Open Settings → download a fresh backup if the app still loads.</li>
              <li>If data is missing, contact support — daily cloud snapshots can restore to any recent point.</li>
              <li>If the cloud project is unreachable, open your latest local .xlsx backup — every sheet maps 1:1 to a table and can be re-imported from the matching page (Products → Products sheet, Contacts → Contacts sheet, etc.).</li>
            </ol>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Data tools</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Replace your books with a complete sample dataset — products, contacts, sales, purchases, third-party deals, quotations, payments, and expenses.</p>
            <Button variant="outline" disabled={seeding || clearing} onClick={seed}>{seeding ? "Loading…" : "Load demo data"}</Button>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2"><span className="text-destructive font-medium">Danger zone.</span> Permanently delete every transaction, contact, and product in your account. Your company profile is kept.</p>
            <Button variant="destructive" disabled={seeding || clearing} onClick={clearAll}>{clearing ? "Clearing…" : "Clear all data"}</Button>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2">
              <span className="text-destructive font-medium">Close account.</span> Marks your account as closed and signs you out. Your data is preserved for <b>60 days</b> in case you change your mind — sign in again within that window to reactivate. After 60 days everything is permanently deleted.
            </p>
            <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={closeAccount}>
              <LogOut className="h-4 w-4" /> Close my account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}