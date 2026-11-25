import { AdminOnly } from "@/components/aqualedger/app-shell";
import { StarterPage } from "@/components/aqualedger/starter-page";
export default function SettingsPage() { return <AdminOnly><StarterPage page="settings" /></AdminOnly>; }
