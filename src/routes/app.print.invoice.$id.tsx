import { createFileRoute } from "@tanstack/react-router";
import { PrintDoc } from "@/components/print-doc";

export const Route = createFileRoute("/app/print/invoice/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <PrintDoc kind="invoice" id={id} />;
  },
});