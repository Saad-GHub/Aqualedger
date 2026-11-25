import { AdminOnly } from "@/components/aqualedger/app-shell";
import { StarterPage } from "@/components/aqualedger/starter-page";
export default function QualityPage() { return <AdminOnly><StarterPage page="quality" /></AdminOnly>; }
