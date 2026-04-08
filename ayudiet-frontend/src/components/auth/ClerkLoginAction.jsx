import { useEffect, useRef } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { fetchJson } from "../../services/api";

function ClerkLoginAction({ disabled = false, onError, onSuccess }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut, openSignIn } = useClerk();
  const exchangingRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || exchangingRef.current || completedRef.current) {
      return;
    }

    exchangingRef.current = true;

    const exchangeToken = async () => {
      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          throw new Error("Unable to get Clerk session token");
        }

        const data = await fetchJson("/auth/clerk/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clerkToken }),
        });

        localStorage.setItem("token", data.token);
        const doctorName = data?.doctor?.name || "";
        if (doctorName) {
          localStorage.setItem("doctorName", doctorName);
        }

        completedRef.current = true;
        onSuccess?.();
      } catch (error) {
        exchangingRef.current = false;
        completedRef.current = false;
        try {
          await signOut();
        } catch {
          // Ignore sign-out cleanup errors.
        }
        onError?.(error?.message || "Clerk login failed");
      }
    };

    exchangeToken();
  }, [getToken, isLoaded, isSignedIn, onError, onSuccess, signOut]);

  const handleClerkSignIn = () => {
    if (disabled) return;
    try {
      openSignIn({
        signUpUrl: "/signup",
      });
    } catch (error) {
      onError?.(error?.message || "Unable to open Clerk sign-in");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClerkSignIn}
      disabled={disabled}
      className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Continue with Clerk
    </button>
  );
}

export default ClerkLoginAction;
