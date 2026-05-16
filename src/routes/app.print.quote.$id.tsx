import { createFileRoute } from "@tanstack/react-router";
import { PrintDoc } from "@/components/print-doc";

export const Route = createFileRoute("/app/print/quote/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <PrintDoc kind="quote" id={id} />;
  },
});