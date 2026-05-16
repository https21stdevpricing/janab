import { createFileRoute } from "@tanstack/react-router";
import { TxnPage } from "@/components/txn-page";

export const Route = createFileRoute("/app/quotations")({
  component: () => (
    <TxnPage cfg={{
      title: "Quotations", description: "Price quotes — no accounting impact",
      table: "quotations", itemsTable: "quotation_items", itemsFk: "quotation_id",
      noField: "quote_no", prefix: "QUO", partyRole: "buyer", printPath: "quote",
    }} />
  ),
});