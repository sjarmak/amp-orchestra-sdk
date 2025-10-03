import React from 'react';
import { SessionsListPanel } from '../components/Sessions/SessionsListPanel';
import { useParams } from 'react-router-dom';

export const SessionsListPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();

  return (
    <div className="flex-1 flex">
      <SessionsListPanel currentSessionId={sessionId} />
      
      {/* Empty state when no session is selected */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Select a session</div>
          <div className="text-sm">
            Choose a session from the sidebar to view its threads and start chatting
          </div>
        </div>
      </div>
    </div>
  );
};
