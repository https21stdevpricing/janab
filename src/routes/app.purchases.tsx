import { createFileRoute } from "@tanstack/react-router";
import { TxnPage } from "@/components/txn-page";

export const Route = createFileRoute("/app/purchases")({
  component: () => (
    <TxnPage cfg={{
      title: "Purchases", description: "Stock received from suppliers",
      table: "purchases", itemsTable: "purchase_items", itemsFk: "purchase_id",
      noField: "po_no", prefix: "PO", partyRole: "supplier",
    }} />
  ),
});