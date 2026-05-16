import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { seedDemoData } from "@/lib/seed-demo";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => { supabase.from("settings").select("*").maybeSingle().then(({ data }) => setS(data)); }, []);

  const save = async () => {
    if (!s) return;
    const { error } = await supabase.from("settings").update({
      company_name: s.company_name, gstin: s.gstin, state: s.state, address: s.address,
      phone: s.phone, email: s.email, low_stock_threshold: s.low_stock_threshold,
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
      <Card>
        <CardHeader><CardTitle>Demo data</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Replace your books with a complete sample dataset — products, contacts, sales, purchases, third-party deals, quotations, payments, and expenses.</p>
          <Button variant="outline" disabled={seeding} onClick={seed}>{seeding ? "Loading…" : "Load demo data"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}