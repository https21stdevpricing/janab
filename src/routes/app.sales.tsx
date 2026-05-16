import { createFileRoute } from "@tanstack/react-router";
import { TxnPage } from "@/components/txn-page";

export const Route = createFileRoute("/app/sales")({
  component: () => (
    <TxnPage cfg={{
      title: "Sales", description: "Invoices issued to buyers",
      table: "sales", itemsTable: "sale_items", itemsFk: "sale_id",
      noField: "invoice_no", prefix: "INV", partyRole: "buyer", printPath: "invoice",
    }} />
  ),
});