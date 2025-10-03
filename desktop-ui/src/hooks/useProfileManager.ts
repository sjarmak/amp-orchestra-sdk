import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface AmpProfile {
  id: string;
  name: string;
  connection_type: "production" | "local-server" | "local-cli";
  api_url?: string;
  cli_path?: string;
  token?: string;
  tls_enabled?: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface ProfileStatus {
  profile_id: string;
  is_connected: boolean;
  health_check: {
    success: boolean;
    message: string;
    version?: string;
    connection_mode: string;
    connection_description: string;
  };
  last_checked: number;
}

export const useProfileManager = () => {
  const [profiles, setProfiles] = useState<AmpProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<AmpProfile | null>(null);
  const [profileStatuses, setProfileStatuses] = useState<
    Record<string, ProfileStatus>
  >({});
  const [isLoading, setIsLoading] = useState(false);

  // Load profiles from backend
  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const profileList = await invoke<AmpProfile[]>("profiles_list");
      setProfiles(profileList);

      const active = profileList.find((p) => p.is_active);
      setActiveProfile(active || null);
    } catch (error) {
      console.error("Failed to load profiles:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new profile
  const createProfile = useCallback(
    async (
      profileData: Omit<
        AmpProfile,
        "id" | "is_active" | "created_at" | "updated_at"
      >
    ) => {
      try {
        console.log("createProfile: Starting profile creation with data:", profileData);
        
        // Validate required fields
        if (!profileData.name || !profileData.connection_type) {
          throw new Error("Missing required fields: name and connection_type are required");
        }
        
        console.log("createProfile: Invoking Tauri backend profile_create command");
        const profile = await invoke<AmpProfile>("profile_create", {
          profile: profileData,
        });
        
        console.log("createProfile: Backend returned profile:", profile);
        
        setProfiles((prev) => [...prev, profile]);
        console.log("createProfile: Profile added to state successfully");
        
        return profile;
      } catch (error) {
        console.error("createProfile: Failed to create profile:", error);
        console.error("createProfile: Error type:", typeof error);
        console.error("createProfile: Error details:", {
          message: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          profileData,
        });
        throw error;
      }
    },
    []
  );

  // Update a profile
  const updateProfile = useCallback(
    async (id: string, updates: Partial<AmpProfile>) => {
      try {
        const profile = await invoke<AmpProfile>("profile_update", {
          id,
          updates,
        });
        setProfiles((prev) => prev.map((p) => (p.id === id ? profile : p)));

        if (activeProfile?.id === id) {
          setActiveProfile(profile);
        }

        return profile;
      } catch (error) {
        console.error("Failed to update profile:", error);
        throw error;
      }
    },
    [activeProfile]
  );

  // Delete a profile
  const deleteProfile = useCallback(
    async (id: string) => {
      try {
        await invoke("profile_delete", { id });
        setProfiles((prev) => prev.filter((p) => p.id !== id));

        if (activeProfile?.id === id) {
          setActiveProfile(null);
        }

        setProfileStatuses((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      } catch (error) {
        console.error("Failed to delete profile:", error);
        throw error;
      }
    },
    [activeProfile]
  );

  // Switch active profile
  const switchProfile = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const profile = await invoke<AmpProfile>("profile_activate", { id });

      setProfiles((prev) =>
        prev.map((p) => ({ ...p, is_active: p.id === id }))
      );
      setActiveProfile(profile);

      return profile;
    } catch (error) {
      console.error("Failed to switch profile:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check profile health
  const checkProfileHealth = useCallback(async (id: string) => {
    try {
      const status = await invoke<ProfileStatus>("profile_health_check", {
        id,
      });
      setProfileStatuses((prev) => ({ ...prev, [id]: status }));
      return status;
    } catch (error) {
      console.error("Failed to check profile health:", error);
      throw error;
    }
  }, []);

  // Auto-detect CLI paths
  const detectCliPaths = useCallback(async () => {
    try {
      return await invoke<string[]>("detect_amp_cli_paths");
    } catch (error) {
      console.error("Failed to detect CLI paths:", error);
      return [];
    }
  }, []);

  // Listen for profile status updates
  useEffect(() => {
    const unlisten = listen<{ profile_id: string; status: ProfileStatus }>(
      "profile_status_update",
      (event) => {
        const { profile_id, status } = event.payload;
        setProfileStatuses((prev) => ({ ...prev, [profile_id]: status }));
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  return {
    // State
    profiles,
    activeProfile,
    profileStatuses,
    isLoading,

    // Actions
    loadProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
    checkProfileHealth,
    detectCliPaths,

    // Helpers
    hasProfiles: profiles.length > 0,
    getProfileStatus: (id: string) => profileStatuses[id],
    isProfileConnected: (id: string) =>
      profileStatuses[id]?.is_connected || false,
  };
};
