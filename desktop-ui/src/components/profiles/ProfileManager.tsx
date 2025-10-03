import { useState, useCallback, memo } from "react";
import {
  ChevronDown,
  Plus,
  User,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  Edit,
  Trash2,
} from "lucide-react";
import { useProfileManager, AmpProfile } from "../../hooks/useProfileManager";
import { ConnectionStatus } from "./ConnectionStatus";
import { ProfileEditor } from "./ProfileEditor";

interface ProfileManagerProps {
  onProfileChange?: (profile: AmpProfile | undefined) => void;
}

const ProfileManagerComponent = ({ onProfileChange }: ProfileManagerProps) => {
  const {
    profiles,
    activeProfile,
    isLoading,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
    checkProfileHealth,
    detectCliPaths,
    getProfileStatus,
    isProfileConnected,
  } = useProfileManager();



  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AmpProfile | null>(null);
  const [profileMenus, setProfileMenus] = useState<Record<string, boolean>>({});

  const handleSwitchProfile = useCallback(async (profile: AmpProfile) => {
    if (profile.id === activeProfile?.id) return;

    try {
      await switchProfile(profile.id);
      setIsDropdownOpen(false);
      onProfileChange?.(profile);
    } catch (error) {
      console.error("Failed to switch profile:", error);
    }
  }, [activeProfile?.id, switchProfile, onProfileChange]);

  const handleCreateProfile = async (
    profileData: Omit<
      AmpProfile,
      "id" | "is_active" | "created_at" | "updated_at"
    >
  ) => {
    await createProfile(profileData);
    setIsEditorOpen(false);
    setEditingProfile(null);
  };

  const handleUpdateProfile = async (
    profileData: Omit<
      AmpProfile,
      "id" | "is_active" | "created_at" | "updated_at"
    >
  ) => {
    if (!editingProfile) return;

    await updateProfile(editingProfile.id, profileData);
    setIsEditorOpen(false);
    setEditingProfile(null);
  };

  const handleDeleteProfile = async (profile: AmpProfile) => {
    if (
      window.confirm(
        `Are you sure you want to delete the profile "${profile.name}"?`
      )
    ) {
      await deleteProfile(profile.id);
      setProfileMenus((prev) => {
        const { [profile.id]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleEditProfile = (profile: AmpProfile) => {
    setEditingProfile(profile);
    setIsEditorOpen(true);
    setProfileMenus({});
  };

  // Optimized profile menu toggle to avoid rebuilding entire object
  const toggleProfileMenu = useCallback((profileId: string) => {
    setProfileMenus((prev) => {
      // Only close other menus if we're opening a new one
      const isCurrentlyOpen = prev[profileId]
      if (!isCurrentlyOpen) {
        // Opening a new menu - close all others and open this one
        const newState: Record<string, boolean> = {}
        Object.keys(prev).forEach(key => {
          newState[key] = key === profileId
        })
        return newState
      } else {
        // Closing current menu
        return {
          ...prev,
          [profileId]: false
        }
      }
    });
  }, []);

  const handleHealthCheck = async (profileId: string): Promise<void> => {
    try {
      await checkProfileHealth(profileId);
      // Return value is ignored - we just want to trigger the health check
    } catch (error) {
      console.error("Health check failed:", error);
    }
  };

  if (profiles.length === 0) {
    return (
      <>
        <div className="p-3">
          <div className="text-center space-y-2">
            <User className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No profiles configured
            </p>
            <button
              onClick={() => setIsEditorOpen(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Create Profile
            </button>
          </div>
        </div>

        <ProfileEditor
          profile={editingProfile ?? undefined}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingProfile(null);
          }}
          onSave={editingProfile ? handleUpdateProfile : handleCreateProfile}
          onDetectCliPaths={detectCliPaths}
        />
      </>
    );
  }

  return (
    <>
      <div className="p-3">
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          >
            <div className="flex items-center space-x-2 min-w-0">
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium text-sm truncate">
                  {activeProfile?.name || "No Profile"}
                </div>
                {activeProfile && (
                  <div className="flex items-center space-x-1 mt-0.5">
                    <ConnectionStatus
                      profile={activeProfile}
                      status={getProfileStatus(activeProfile.id)}
                      onRetry={handleHealthCheck}
                      compact
                    />
                  </div>
                )}
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isDropdownOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
              <div className="p-2">
                <button
                  onClick={() => {
                    setIsEditorOpen(true);
                    setEditingProfile(null);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center space-x-2 p-2 hover:bg-accent rounded-md transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Profile</span>
                </button>
              </div>

              <div className="border-t border-border">
                {profiles.map((profile) => {
                  const isConnected = isProfileConnected(profile.id);
                  const isActive = profile.id === activeProfile?.id;

                  return (
                    <div key={profile.id} className="relative">
                      <div className="flex items-center">
                        <button
                          onClick={() => handleSwitchProfile(profile)}
                          className={`flex-1 flex items-center space-x-2 p-3 hover:bg-accent transition-colors text-sm ${
                            isActive ? "bg-accent" : ""
                          }`}
                        >
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium truncate">
                                {profile.name}
                              </span>
                              {isActive && (
                                <CheckCircle className="w-3 h-3 text-foreground opacity-80 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span className="text-xs text-muted-foreground capitalize">
                                {profile.connection_type.replace("-", " ")}
                              </span>
                              {isConnected ? (
                                <CheckCircle className="w-3 h-3 text-foreground opacity-80" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-muted-foreground/60" />
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="relative">
                          <button
                            onClick={() => toggleProfileMenu(profile.id)}
                            className="p-2 hover:bg-accent rounded-md transition-colors"
                          >
                            <MoreVertical className="w-3 h-3" />
                          </button>

                          {profileMenus[profile.id] && (
                            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-md shadow-lg py-1 z-60 min-w-32">
                              <button
                                onClick={() => handleEditProfile(profile)}
                                className="w-full flex items-center space-x-2 px-3 py-1 hover:bg-accent transition-colors text-sm"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteProfile(profile)}
                                className="w-full flex items-center space-x-2 px-3 py-1 hover:bg-destructive/10 text-destructive transition-colors text-sm"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeProfile && (
                <div className="border-t border-border p-3">
                  <ConnectionStatus
                    profile={activeProfile}
                    status={getProfileStatus(activeProfile.id)}
                    onRetry={handleHealthCheck}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ProfileEditor
        profile={editingProfile ?? undefined}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingProfile(null);
        }}
        onSave={editingProfile ? handleUpdateProfile : handleCreateProfile}
        onDetectCliPaths={detectCliPaths}
      />
    </>
  );
};

// Memoize ProfileManager to prevent unnecessary re-renders
export const ProfileManager = memo(ProfileManagerComponent, (prevProps, nextProps) => {
  return prevProps.onProfileChange === nextProps.onProfileChange;
});

ProfileManager.displayName = 'ProfileManager';
