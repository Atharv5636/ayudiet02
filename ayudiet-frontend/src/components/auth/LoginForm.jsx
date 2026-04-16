import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { fetchJson } from "../../services/api";
import AuthTextField from "./AuthTextField";
import { isValidEmail } from "../../utils/authValidation";
import { completeAuthLogin } from "../../utils/authSession";

const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_ONLY_LOGIN = false;

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef(null);

  const navigate = useNavigate();
  const isGoogleLoginEnabled = GOOGLE_AUTH_ENABLED && Boolean(GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (!GOOGLE_AUTH_ENABLED || !GOOGLE_CLIENT_ID || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;
    const scriptId = "google-identity-services";

    const initializeGoogle = () => {
      if (
        cancelled ||
        !window.google?.accounts?.id ||
        !googleButtonRef.current
      ) {
        return;
      }

      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: false,
        callback: async (response) => {
          if (!response?.credential) {
            setMessage("Google did not return a credential. Please try again.");
            return;
          }

          setMessage("");
          setStatusMessage("Signing in with Google...");
          setIsSubmitting(true);
          try {
            const data = await fetchJson("/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken: response.credential }),
            });

            await completeAuthLogin(data, navigate);
          } catch (error) {
            setMessage(error.message || "Google login failed");
          } finally {
            setStatusMessage("");
            setIsSubmitting(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 360,
      });
      setGoogleReady(true);
      setStatusMessage("");
    };

    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      if (window.google?.accounts?.id) {
        initializeGoogle();
      } else {
        existingScript.addEventListener("load", initializeGoogle, { once: true });
      }
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = () => {
      if (!cancelled) {
        setGoogleReady(false);
        setStatusMessage("");
        setMessage("Unable to load Google login. Try again later.");
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setMessage("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("Logging in...");

    try {
      const data = await fetchJson("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      await completeAuthLogin({
        ...data,
        doctor: {
          ...data?.doctor,
          name: data?.doctor?.name || (email.includes("@") ? email.split("@")[0] : ""),
          email: data?.doctor?.email || normalizedEmail,
        },
      }, navigate);
    } catch (error) {
      setMessage(error.message || "Server error");
    } finally {
      setStatusMessage("");
      setIsSubmitting(false);
    }
  };

  if (GOOGLE_ONLY_LOGIN && isGoogleLoginEnabled) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Sign in securely with Google to continue to your dashboard.
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-[0.14em] text-slate-400">sign in</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="flex justify-center">
            <div ref={googleButtonRef} />
          </div>
          {!googleReady && (
            <p className="text-center text-xs text-slate-500">
              {statusMessage || "Loading Google sign-in..."}
            </p>
          )}
        </div>

        {googleReady && statusMessage && (
          <p className="text-center text-xs text-slate-500">{statusMessage}</p>
        )}

        {message && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {message}
          </p>
        )}

        <p className="pt-1 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-semibold text-slate-900 hover:text-emerald-700">
            Sign up for free
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <AuthTextField
        label="Email"
        type="email"
        placeholder="doctor@ayudiet.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <AuthTextField
        label="Password"
        type={showPassword ? "text" : "password"}
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        rightSlot={
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="text-slate-400 transition hover:text-slate-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
      />

      <div className="flex justify-end">
        <button
          type="button"
          className="text-sm font-medium text-slate-500 transition hover:text-emerald-700"
        >
          Forgot Password?
        </button>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-[#111111] py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#1d1d1d] active:scale-[0.99]"
      >
        {isSubmitting ? "Logging in..." : "Login"}
      </button>

      {GOOGLE_AUTH_ENABLED && GOOGLE_CLIENT_ID && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-[0.14em] text-slate-400">or</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="flex justify-center">
            <div ref={googleButtonRef} />
          </div>
          {!googleReady && (
            <p className="text-center text-xs text-slate-500">
              {statusMessage || "Loading Google sign-in..."}
            </p>
          )}
        </div>
      )}

      {googleReady && statusMessage && (
        <p className="text-center text-xs text-slate-500">{statusMessage}</p>
      )}

      {message && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      )}

      <p className="pt-1 text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link to="/signup" className="font-semibold text-slate-900 hover:text-emerald-700">
          Sign up for free
        </Link>
      </p>
    </form>
  );
}

export default LoginForm;
