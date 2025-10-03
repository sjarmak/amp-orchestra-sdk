/**
 * NewThreadButton Component - Button for creating new threads
 */

import { Plus } from "lucide-react";

interface NewThreadButtonProps {
  onCreateThread: () => void;
  disabled?: boolean;
  className?: string;
}

export function NewThreadButton({
  onCreateThread,
  disabled = false,
  className = "",
}: NewThreadButtonProps) {
  return (
    <button
      onClick={onCreateThread}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title="Create new thread (⌘⇧N)"
    >
      <Plus className="w-4 h-4" />
      <span>New thread</span>
    </button>
  );
}
