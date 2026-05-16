import { createFileRoute } from "@tanstack/react-router";
import { TxnPage } from "@/components/txn-page";

export const Route = createFileRoute("/app/third-party")({
  component: () => (
    <TxnPage cfg={{
      title: "Third Party", description: "Supplier ships direct to buyer through you (no stock movement)",
      table: "third_party", itemsTable: "tp_items", itemsFk: "tp_id",
      noField: "tp_no", prefix: "TP", partyRole: "tp",
    }} />
  ),
});