import { WhatsAppTester } from "@/components/aqualedger/whatsapp-tester";

export const metadata = { title: "Aqua Chatbot | AquaLedger" };

// Aqua Chatbot on the website: the same brain as the WhatsApp bot, in a web chat.
export default function AquaChatbotPage() {
  return <WhatsAppTester />;
}
