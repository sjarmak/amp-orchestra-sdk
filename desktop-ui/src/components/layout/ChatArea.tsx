import React from 'react';
import Chat from '../Chat/Chat';

interface ChatAreaProps {
  className?: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ className = '' }) => {
  return (
    <div className={`flex-1 flex flex-col bg-background ${className}`}>
      <Chat />
    </div>
  );
};
