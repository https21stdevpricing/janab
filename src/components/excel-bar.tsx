import { useRef } from "react";
import { Button } from "@/components/ui/button";
// Import = file going INTO the app  → FileInput
// Export = file leaving the app     → FileOutput
import { FileInput, FileOutput } from "lucide-react";

export function ExcelBar({
  onExport,
  onImport,
  exportLabel = "Export",
  importLabel = "Import",
}: {
  onExport: () => void;
  onImport?: (file: File) => void;
  exportLabel?: string;
  importLabel?: string;
}) {
  const inp = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-1.5">
      {onImport && (
        <>
          <input
            ref={inp}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              if (inp.current) inp.current.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => inp.current?.click()}>
            <FileInput className="h-4 w-4" /> <span className="hidden sm:inline">{importLabel}</span>
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" onClick={onExport}>
        <FileOutput className="h-4 w-4" /> <span className="hidden sm:inline">{exportLabel}</span>
      </Button>
    </div>
  );
}