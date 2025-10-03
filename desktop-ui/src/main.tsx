import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { setupGlobalFileNavigationPrevention } from "./utils/preventFileNavigation";
import { initTauriProvider } from "@ampsm/amp-client/browser";

// Setup global file navigation prevention
setupGlobalFileNavigationPrevention();

// Initialize Tauri provider for amp-client
initTauriProvider();

// Setup E2E test bridge
interface AmpE2EBridge {
  getEnvironmentBadgeText(): string | null;
  getLastAssistantMessage(): string | null;
  getChatInputValue(): string | null;
  getAllMessages(): Array<{ role: string; content: string; testId: string }>;
  isEnvironmentSwitcherOpen(): boolean;
}

const setupE2EBridge = (): AmpE2EBridge => ({
  getEnvironmentBadgeText() {
    try {
      const badge = document.querySelector('[data-test-id="env-badge"]');
      return badge?.textContent?.trim() || null;
    } catch {
      return null;
    }
  },

  getLastAssistantMessage() {
    try {
      const assistantMsgs = document.querySelectorAll('[data-test-id="chat-msg-assistant"]');
      const lastMsg = assistantMsgs[assistantMsgs.length - 1];
      return lastMsg?.querySelector('p')?.textContent?.trim() || null;
    } catch {
      return null;
    }
  },

  getChatInputValue() {
    try {
      const input = document.querySelector('[data-test-id="chat-input"]') as HTMLInputElement;
      return input?.value || null;
    } catch {
      return null;
    }
  },

  getAllMessages() {
    try {
      const messages: Array<{ role: string; content: string; testId: string }> = [];
      const msgElements = document.querySelectorAll('[data-test-id^="chat-msg-"]');
      
      msgElements.forEach((el) => {
        const testId = el.getAttribute('data-test-id') || '';
        const role = testId.replace('chat-msg-', '');
        const content = el.querySelector('p')?.textContent?.trim() || '';
        messages.push({ role, content, testId });
      });
      
      return messages;
    } catch {
      return [];
    }
  },

  isEnvironmentSwitcherOpen() {
    try {
      const switcher = document.querySelector('[role="dialog"][aria-modal="true"]');
      return switcher !== null;
    } catch {
      return false;
    }
  }
});

// Expose global test bridge
(window as any).__AMP_E2E_BRIDGE__ = setupE2EBridge();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
