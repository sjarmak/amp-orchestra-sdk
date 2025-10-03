import { useState } from "react";
import { TerminalManagerProvider } from "./components/terminal/TerminalManagerContext";
import { TerminalProvider } from "./components/terminal/TerminalProvider";
import { TerminalLifecycleManager } from "./contexts/TerminalLifecycleManager";
import { AmpModeProvider } from "./components/app/AmpModeProvider";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SessionManagerProvider } from "./contexts/SessionManagerContext";
import { RepositoryProvider } from "./contexts/RepositoryContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { UILayoutProvider } from "./contexts/UILayoutContext";

import { useProfileManager } from "./hooks/useProfileManager";
import { OnboardingModal } from "./components/onboarding/OnboardingModal";
import { TabFreeConductorLayout } from "./components/layout/TabFreeConductorLayout";





function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { createProfile, detectCliPaths } = useProfileManager();

  const handleOnboardingComplete = async (
    profileData: Parameters<typeof createProfile>[0]
  ) => {
    await createProfile(profileData);
    setShowOnboarding(false);
  };

  return (
    <ThemeProvider>
      <SessionManagerProvider>
        <AmpModeProvider defaultMode="production">
          <RepositoryProvider>
            <WorkspaceProvider>
              <UILayoutProvider>
                <TerminalProvider>
                  <TerminalLifecycleManager>
                    <TerminalManagerProvider>
                      <TabFreeConductorLayout />
                      
                      <OnboardingModal
                        isOpen={showOnboarding}
                        onComplete={handleOnboardingComplete}
                        onDetectCliPaths={detectCliPaths}
                      />
                    </TerminalManagerProvider>
                  </TerminalLifecycleManager>
                </TerminalProvider>
              </UILayoutProvider>
            </WorkspaceProvider>
          </RepositoryProvider>
        </AmpModeProvider>
      </SessionManagerProvider>
    </ThemeProvider>
  );
}

export default App;
