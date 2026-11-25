import { AdminOnly } from "@/components/aqualedger/app-shell";
import { StarterPage } from "@/components/aqualedger/starter-page";
export default function MonitoringPage() { return <AdminOnly><StarterPage page="monitoring" /></AdminOnly>; }
