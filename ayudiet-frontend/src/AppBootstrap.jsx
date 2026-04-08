import React from "react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const CLERK_ENABLED = import.meta.env.VITE_ENABLE_CLERK_AUTH === "true";
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

export default function AppBootstrap() {
  const [ClerkProviderComponent, setClerkProviderComponent] = React.useState(null);

  React.useEffect(() => {
    let alive = true;

    const loadClerkProvider = async () => {
      if (!(CLERK_ENABLED && CLERK_PUBLISHABLE_KEY)) {
        return;
      }

      try {
        const module = await import("@clerk/clerk-react");
        if (alive) {
          setClerkProviderComponent(() => module.ClerkProvider);
        }
      } catch (error) {
        console.error("Failed to load Clerk provider:", error);
      }
    };

    loadClerkProvider();

    return () => {
      alive = false;
    };
  }, []);

  const appTree = (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  if (CLERK_ENABLED && CLERK_PUBLISHABLE_KEY && ClerkProviderComponent) {
    return (
      <ClerkProviderComponent publishableKey={CLERK_PUBLISHABLE_KEY}>
        {appTree}
      </ClerkProviderComponent>
    );
  }

  return appTree;
}

