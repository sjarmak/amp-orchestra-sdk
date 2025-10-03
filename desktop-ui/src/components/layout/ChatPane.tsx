import React from 'react';
import { ChatArea } from './ChatArea';

interface ChatPaneProps {
  className?: string;
}

/**
 * ChatPane wraps the existing ChatArea component for use in the resizable layout
 */
export const ChatPane: React.FC<ChatPaneProps> = ({ className = '' }) => {
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <ChatArea className="flex-1" />
    </div>
  );
};
