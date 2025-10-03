/**
 * ThreadPicker Component - Dropdown for selecting and managing threads within a session
 */

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  MessageSquare,
  Check,
  X,
} from "lucide-react";
import { Thread } from "../../contexts/SessionManagerContext";

interface ThreadPickerProps {
  threads: Thread[];
  activeThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  onCreateThread: () => void;
  onRenameThread: (threadId: string, name: string) => void;
  onDeleteThread: (threadId: string) => void;
  disabled?: boolean;
}

export function ThreadPicker({
  threads,
  activeThreadId,
  onThreadSelect,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
  disabled = false,
}: ThreadPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const activeThread = threads.find(t => t.id === activeThreadId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setEditingThreadId(null);
        setShowDeleteConfirm(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingThreadId]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'N') {
        event.preventDefault();
        onCreateThread();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCreateThread]);

  const handleEditStart = (thread: Thread) => {
    setEditingThreadId(thread.id);
    setEditName(thread.name);
  };

  const handleEditSave = () => {
    if (editingThreadId && editName.trim()) {
      onRenameThread(editingThreadId, editName.trim());
    }
    setEditingThreadId(null);
    setEditName("");
  };

  const handleEditCancel = () => {
    setEditingThreadId(null);
    setEditName("");
  };

  const handleDelete = (threadId: string) => {
    if (showDeleteConfirm === threadId) {
      onDeleteThread(threadId);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(threadId);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Thread Picker Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Select thread"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="max-w-[200px] truncate">
          {activeThread?.name || "Select thread"}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-background border border-border rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto">
          {/* New Thread Button */}
          <button
            onClick={() => {
              onCreateThread();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors border-b border-border"
          >
            <Plus className="w-4 h-4" />
            <span>New thread</span>
            <kbd className="ml-auto px-2 py-1 text-xs bg-muted rounded">⌘⇧N</kbd>
          </button>

          {/* Thread List */}
          <div className="py-1">
            {threads.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                No threads yet
              </div>
            ) : (
              threads.map((thread) => (
                <div key={thread.id} className="group">
                  {editingThreadId === thread.id ? (
                    /* Edit Mode */
                    <div className="flex items-center gap-2 px-4 py-2">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave();
                          if (e.key === "Escape") handleEditCancel();
                        }}
                        className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Thread name"
                      />
                      <button
                        onClick={handleEditSave}
                        className="p-1 hover:bg-accent rounded"
                        title="Save"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="p-1 hover:bg-accent rounded"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    /* Normal Mode */
                    <div className="flex items-center group hover:bg-accent">
                      <button
                        onClick={() => {
                          onThreadSelect(thread.id);
                          setIsOpen(false);
                        }}
                        className={`flex-1 flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                          activeThreadId === thread.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-accent"
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{thread.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(thread.lastActiveAt).toLocaleDateString()}
                          </div>
                        </div>
                        {activeThreadId === thread.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </button>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditStart(thread);
                          }}
                          className="p-1 hover:bg-accent rounded"
                          title="Rename thread"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(thread.id);
                          }}
                          className={`p-1 hover:bg-destructive/20 rounded ${
                            showDeleteConfirm === thread.id
                              ? "bg-destructive/20 text-destructive"
                              : ""
                          }`}
                          title={
                            showDeleteConfirm === thread.id
                              ? "Click again to confirm deletion"
                              : "Delete thread"
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
