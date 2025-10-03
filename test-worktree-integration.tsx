/**
 * Test component to verify worktree integration
 * This demonstrates how to use the updated SessionManagerContext with actual worktree creation
 */

import React, { useState } from 'react';
import { useSessionManager } from './desktop-ui/src/contexts/SessionManagerContext';

export function WorktreeIntegrationTest() {
  const {
    createSession,
    deleteSession,
    getWorktreeError,
    isSessionPending,
    checkRepositoryClean,
    clearWorktreeError,
    getSessionsForRepo,
  } = useSessionManager();

  const [testRepo, setTestRepo] = useState('/Users/sjarmak/amp-orchestra');
  const [testBranch, setTestBranch] = useState('feature/test-session');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedSessionId, setLastCreatedSessionId] = useState<string | null>(null);

  const handleCreateSession = async () => {
    setIsCreating(true);
    setError(null);
    
    try {
      // First check if repository is clean
      const isClean = await checkRepositoryClean(testRepo);
      if (!isClean) {
        setError('Repository has uncommitted changes. Please commit or stash changes before creating a new session.');
        return;
      }

      // Create the session with actual worktree
      const sessionId = await createSession(
        testRepo,
        `Test Session (${testBranch})`,
        'development',
        testBranch
      );

      setLastCreatedSessionId(sessionId);
      console.log('Successfully created session:', sessionId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to create session: ${errorMessage}`);
      console.error('Session creation failed:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, force: boolean = false) => {
    try {
      await deleteSession(sessionId, force);
      console.log('Successfully deleted session:', sessionId);
      if (sessionId === lastCreatedSessionId) {
        setLastCreatedSessionId(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete session: ${errorMessage}`);
      console.error('Session deletion failed:', err);
    }
  };

  const sessions = getSessionsForRepo(testRepo);
  const worktreeError = lastCreatedSessionId ? getWorktreeError(lastCreatedSessionId) : null;
  const isPending = lastCreatedSessionId ? isSessionPending(lastCreatedSessionId) : false;

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h2>Worktree Integration Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label>Repository Path:</label>
          <input 
            type="text" 
            value={testRepo} 
            onChange={(e) => setTestRepo(e.target.value)}
            style={{ marginLeft: '10px', width: '400px' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>Branch Name:</label>
          <input 
            type="text" 
            value={testBranch} 
            onChange={(e) => setTestBranch(e.target.value)}
            style={{ marginLeft: '10px', width: '200px' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={handleCreateSession}
          disabled={isCreating}
          style={{ 
            padding: '10px 20px', 
            marginRight: '10px',
            backgroundColor: '#007ACC',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isCreating ? 'not-allowed' : 'pointer'
          }}
        >
          {isCreating ? 'Creating Session...' : 'Create Test Session'}
        </button>

        {lastCreatedSessionId && (
          <button 
            onClick={() => handleDeleteSession(lastCreatedSessionId)}
            style={{ 
              padding: '10px 20px', 
              marginRight: '10px',
              backgroundColor: '#DC3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Delete Session
          </button>
        )}

        {lastCreatedSessionId && (
          <button 
            onClick={() => handleDeleteSession(lastCreatedSessionId, true)}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#FD7E14',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Force Delete Session
          </button>
        )}
      </div>

      {error && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#F8D7DA', 
          color: '#721C24',
          border: '1px solid #F5C6CB',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Error:</strong> {error}
          <button 
            onClick={() => setError(null)} 
            style={{ marginLeft: '10px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {worktreeError && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#FFF3CD', 
          color: '#856404',
          border: '1px solid #FFEAA7',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Worktree Error ({worktreeError.type}):</strong> {worktreeError.message}
          {worktreeError.details && <div><em>Details:</em> {worktreeError.details}</div>}
          <button 
            onClick={() => lastCreatedSessionId && clearWorktreeError(lastCreatedSessionId)} 
            style={{ marginLeft: '10px', cursor: 'pointer' }}
          >
            Clear Error
          </button>
        </div>
      )}

      {isPending && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#D4EDDA', 
          color: '#155724',
          border: '1px solid #C3E6CB',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          Session creation is pending...
        </div>
      )}

      <div>
        <h3>Sessions for Repository</h3>
        {sessions.length === 0 ? (
          <p>No sessions found for this repository.</p>
        ) : (
          <ul>
            {sessions.map(session => (
              <li key={session.id} style={{ marginBottom: '10px' }}>
                <strong>{session.name}</strong> ({session.id.slice(0, 8)})
                <br />
                <small>
                  Environment: {session.environment} | 
                  Branch: {session.worktreeBranch} | 
                  Path: {session.worktreePath}
                </small>
                {session.id !== lastCreatedSessionId && (
                  <button 
                    onClick={() => handleDeleteSession(session.id)}
                    style={{ 
                      marginLeft: '10px',
                      padding: '2px 8px',
                      fontSize: '12px',
                      backgroundColor: '#DC3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
