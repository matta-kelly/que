import type { SuggestionConfig } from "@assistant-ui/react";

// Starting suggestions on an empty chat. Clicking one fills the message box
// (it doesn't send), so prompts that need an Odoo id can be finished first.
export const CHAT_SUGGESTIONS: SuggestionConfig[] = [
  { title: "Look up a customer company", label: "by Odoo id", prompt: "Look up the customer company with Odoo id " },
  { title: "Find a buyer's contact details", label: "for a company", prompt: "Find the buyers and their contact details for the company with Odoo id " },
  { title: "Check a company's addresses", label: "billing and delivery", prompt: "Check the billing and delivery addresses for the company with Odoo id " },
  { title: "What can you do?", label: "tools and skills", prompt: "What can you help me with? List your tools and skills." },
];
