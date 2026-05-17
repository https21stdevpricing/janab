import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/party-page";

export const Route = createFileRoute("/app/buyers")({ component: () => <PartyPage role="buyer" /> });