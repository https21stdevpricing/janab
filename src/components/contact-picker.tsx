import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, ChevronsUpDown, Plus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type C = { id: string; name: string; type: string; phone?: string | null; state?: string | null };

export function ContactPicker({
  value, onChange, filter,
}: {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  filter?: "buyer" | "supplier";
}) {
  const [rows, setRows] = useState<C[]>([]);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<{ name: string; phone: string; state: string; gstin: string; address: string }>({
    name: "", phone: "", state: "", gstin: "", address: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    let q = supabase.from("contacts").select("id,name,type,phone,state").order("name");
    if (filter === "buyer") q = q.in("type", ["buyer", "both"]);
    else if (filter === "supplier") q = q.in("type", ["supplier", "both"]);
    const { data } = await q;
    setRows((data ?? []) as C[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const selected = useMemo(() => rows.find(r => r.id === value) ?? null, [rows, value]);
  const label = filter === "supplier" ? "supplier" : filter === "buyer" ? "buyer" : "contact";

  const startCreate = () => {
    setDraft(d => ({ ...d, name: search.trim() }));
    setOpen(false);
    setCreateOpen(true);
  };

  const saveNew = async () => {
    if (!draft.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); toast.error("Not signed in"); return; }
    const type = (filter ?? "buyer") as "buyer" | "supplier";
    const { data, error } = await supabase.from("contacts")
      .insert({
        user_id: u.user.id,
        type,
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        state: draft.state.trim() || null,
        gstin: draft.gstin.trim() || null,
        address: draft.address.trim() || null,
      } as never)
      .select("id,name,type,phone,state")
      .single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message ?? "Failed to create"); return; }
    const c = data as C;
    setRows(rs => [...rs, c].sort((a, b) => a.name.localeCompare(b.name)));
    onChange(c.id, c.name);
    setCreateOpen(false);
    setDraft({ name: "", phone: "", state: "", gstin: "", address: "" });
    toast.success(`${label[0].toUpperCase()}${label.slice(1)} added`);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox"
            className={cn("h-9 w-full justify-between font-normal", !selected && "text-muted-foreground")}>
            <span className="truncate">{selected?.name ?? `Select ${label}…`}</span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
          <Command shouldFilter={true}>
            <CommandInput placeholder={`Search ${label}…`} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                <div className="p-2 text-xs text-muted-foreground">No matches.</div>
              </CommandEmpty>
              <CommandGroup>
                {rows.map(r => (
                  <CommandItem key={r.id} value={`${r.name} ${r.phone ?? ""}`} onSelect={() => {
                    onChange(r.id, r.name); setOpen(false); setSearch("");
                  }}>
                    <Check className={cn("h-4 w-4 mr-2", value === r.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{r.name}</span>
                    {r.phone && <span className="ml-auto text-[10px] text-muted-foreground">{r.phone}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <div className="border-t p-1">
                <Button type="button" variant="ghost" className="w-full justify-start h-8" onClick={startCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  {search.trim() ? `Create “${search.trim()}”` : `Add new ${label}`}
                </Button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 capitalize"><UserPlus className="h-4 w-4" /> New {label}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs">Name *</Label>
              <Input autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><Label className="text-xs">Phone</Label>
              <Input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></div>
            <div><Label className="text-xs">State</Label>
              <Input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value })} placeholder="Rajasthan" /></div>
            <div className="col-span-2"><Label className="text-xs">GSTIN</Label>
              <Input value={draft.gstin} onChange={e => setDraft({ ...draft, gstin: e.target.value })} className="font-mono uppercase" /></div>
            <div className="col-span-2"><Label className="text-xs">Address</Label>
              <Input value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={saveNew} disabled={saving || !draft.name.trim()}>{saving ? "Saving…" : `Add ${label}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}