import React, { useState, useEffect } from 'react';
import { Wrench, Plus, Trash2, FolderOpen, X, ChevronDown, Edit2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAmpService, ToolboxProfile } from '../../hooks/useAmpService';

interface ToolboxProfileSelectProps {
  className?: string;
}

export const ToolboxProfileSelect: React.FC<ToolboxProfileSelectProps> = ({ className }) => {
  const { 
    listToolboxProfiles, 
    createToolboxProfile, 
    updateToolboxProfile, 
    deleteToolboxProfile,
    setActiveToolboxProfile,
    getActiveToolboxProfile
  } = useAmpService();

  const [profiles, setProfiles] = useState<ToolboxProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ToolboxProfile | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ToolboxProfile | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePaths, setNewProfilePaths] = useState<string[]>([]);

  const loadProfiles = async () => {
    try {
      const profileList = await listToolboxProfiles();
      setProfiles(profileList);
      
      const active = await getActiveToolboxProfile();
      setActiveProfile(active);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  useEffect(() => {
    // Load profiles with a slight delay to ensure app state is ready
    const timer = setTimeout(() => {
      loadProfiles();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleProfileSelect = async (profile: ToolboxProfile | null) => {
    try {
      await setActiveToolboxProfile(profile?.id || null);
      setActiveProfile(profile);
      setIsDropdownOpen(false);
    } catch (error) {
      console.error('Failed to set active profile:', error);
    }
  };

  const handleAddPath = async () => {
    try {
      const result = await open({
        directory: true,
        title: 'Select Toolbox Directory'
      });
      
      if (result && !newProfilePaths.includes(result)) {
        setNewProfilePaths([...newProfilePaths, result]);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleRemovePath = (index: number) => {
    setNewProfilePaths(newProfilePaths.filter((_, i) => i !== index));
  };

  const handleMovePath = (fromIndex: number, toIndex: number) => {
    const newPaths = [...newProfilePaths];
    const [moved] = newPaths.splice(fromIndex, 1);
    newPaths.splice(toIndex, 0, moved);
    setNewProfilePaths(newPaths);
  };

  const handleCreateProfile = async () => {
    if (!newProfileName.trim() || newProfilePaths.length === 0) return;

    try {
      await createToolboxProfile({
        name: newProfileName.trim(),
        paths: newProfilePaths
      });
      
      resetForm();
      await loadProfiles();
    } catch (error) {
      console.error('Failed to create profile:', error);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editingProfile || !newProfileName.trim()) return;

    try {
      await updateToolboxProfile({
        id: editingProfile.id,
        name: newProfileName.trim(),
        paths: newProfilePaths
      });
      
      resetForm();
      await loadProfiles();
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleDeleteProfile = async (profile: ToolboxProfile) => {
    if (!confirm(`Delete profile "${profile.name}"?`)) return;

    try {
      await deleteToolboxProfile(profile.id);
      await loadProfiles();
    } catch (error) {
      console.error('Failed to delete profile:', error);
    }
  };

  const startEditProfile = (profile: ToolboxProfile) => {
    setEditingProfile(profile);
    setNewProfileName(profile.name);
    setNewProfilePaths([...profile.paths]);
    setIsManagerOpen(true);
  };

  const resetForm = () => {
    setEditingProfile(null);
    setNewProfileName('');
    setNewProfilePaths([]);
  };

  const displayValue = activeProfile ? activeProfile.name : 'No toolbox';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Wrench className="h-4 w-4 text-muted-foreground" />
      
      {/* Profile selector */}
      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground hover:bg-muted transition-colors flex items-center gap-1"
          title={activeProfile ? `Paths:\n${activeProfile.paths.join('\n')}` : "Select toolbox profile"}
        >
          <span className="max-w-32 truncate">{displayValue}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        
        {isDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-background border border-border rounded-md shadow-lg z-50">
            {profiles.length > 0 && (
              <div
                className="px-3 py-2 text-xs hover:bg-muted cursor-pointer border-b"
                onClick={() => handleProfileSelect(null)}
              >
                No toolbox
              </div>
            )}
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="px-3 py-2 text-xs hover:bg-muted cursor-pointer flex items-center justify-between group"
                onClick={() => handleProfileSelect(profile)}
                title={`Paths:\n${profile.paths.join('\n')}`}
              >
                <span className="truncate">
                  {profile.name}
                </span>
                {profile.id === activeProfile?.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDropdownOpen(false);
                      startEditProfile(profile);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted-foreground/20 rounded"
                    title="Edit profile"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {activeProfile && (
              <div
                className="px-3 py-2 text-xs hover:bg-muted cursor-pointer flex items-center gap-2 border-t"
                onClick={() => {
                  setIsDropdownOpen(false);
                  startEditProfile(activeProfile);
                }}
              >
                <Edit2 className="w-3 h-3" />
                Edit Current Profile
              </div>
            )}
            <div
              className={`px-3 py-2 text-xs hover:bg-muted cursor-pointer flex items-center gap-2 ${profiles.length > 0 || activeProfile ? 'border-t' : ''}`}
              onClick={() => {
                setIsDropdownOpen(false);
                setIsManagerOpen(true);
                resetForm();
              }}
            >
              <Plus className="w-3 h-3" />
              Add Toolbox
            </div>
          </div>
        )}
      </div>

      {/* Clear button */}
      {activeProfile && (
        <button
          onClick={() => handleProfileSelect(null)}
          className="text-xs p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear toolbox selection"
        >
          <X className="w-3 h-3" />
        </button>
      )}



      {/* Profile Manager Modal */}
      {isManagerOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-background border border-border rounded-lg w-[800px] h-[600px] flex flex-col">
            <div className="border-b border-border p-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">Manage Toolbox Profiles</h2>
              <button
                onClick={() => {
                  setIsManagerOpen(false);
                  resetForm();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              {/* Left panel - Profile list */}
              <div className="w-1/3 border-r border-border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Profiles</h3>
                  <button
                    onClick={resetForm}
                    className="text-xs bg-muted/50 border border-border rounded px-2 py-1 hover:bg-muted transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </button>
                </div>
                
                <div className="space-y-2 overflow-y-auto max-h-96">
                  {profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className={`p-3 border border-border rounded cursor-pointer hover:bg-muted/50 ${
                        editingProfile?.id === profile.id ? 'border-foreground bg-muted/20' : ''
                      }`}
                      onClick={() => startEditProfile(profile)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{profile.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {profile.paths.length} path{profile.paths.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleDeleteProfile(profile);
                            }}
                            className="text-muted-foreground hover:text-foreground p-1"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right panel - Profile editor */}
              <div className="flex-1 p-4">
                <h3 className="font-medium mb-4">
                  {editingProfile ? `Edit ${editingProfile.name}` : 'Create New Profile'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Profile Name</label>
                    <input
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="Enter profile name..."
                      className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Toolbox Paths</label>
                    <div className="space-y-2 mt-2">
                      {newProfilePaths.map((path, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 border border-border rounded">
                          <div className="flex-1 text-xs font-mono truncate" title={path}>
                            {path}
                          </div>
                          <div className="flex gap-1">
                            {index > 0 && (
                              <button
                                onClick={() => handleMovePath(index, index - 1)}
                                className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                              >
                                ↑
                              </button>
                            )}
                            {index < newProfilePaths.length - 1 && (
                              <button
                                onClick={() => handleMovePath(index, index + 1)}
                                className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                              >
                                ↓
                              </button>
                            )}
                            <button
                              onClick={() => handleRemovePath(index)}
                              className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      <button
                        onClick={handleAddPath}
                        className="w-full text-xs bg-muted/50 border border-border rounded px-3 py-2 hover:bg-muted transition-colors flex items-center justify-center gap-2"
                      >
                        <FolderOpen className="h-3 w-3" />
                        Add Path
                      </button>
                    </div>
                    
                    <div className="text-xs text-muted-foreground mt-2">
                      Paths higher in the list have higher precedence for tool name conflicts.
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    {editingProfile ? (
                      <button
                        onClick={handleUpdateProfile}
                        disabled={!newProfileName.trim() || newProfilePaths.length === 0}
                        className="text-xs bg-foreground text-background border border-border rounded px-3 py-2 hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Update Profile
                      </button>
                    ) : (
                      <button
                        onClick={handleCreateProfile}
                        disabled={!newProfileName.trim() || newProfilePaths.length === 0}
                        className="text-xs bg-foreground text-background border border-border rounded px-3 py-2 hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Create Profile
                      </button>
                    )}
                    <button 
                      onClick={resetForm}
                      className="text-xs bg-muted/50 border border-border rounded px-3 py-2 hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
};
