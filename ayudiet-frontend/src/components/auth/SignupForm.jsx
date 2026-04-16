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
const GOOGLE_ONLY_SIGNUP = false;

function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [message, setMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef(null);

  const navigate = useNavigate();
  const isGoogleSignupEnabled = GOOGLE_AUTH_ENABLED && Boolean(GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (!GOOGLE_AUTH_ENABLED || !GOOGLE_CLIENT_ID || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;
    const scriptId = "google-identity-services-signup";

    const initializeGoogle = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
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
          setIsSuccess(false);
          setStatusMessage("Signing up with Google...");
          setIsSubmitting(true);

          try {
            const data = await fetchJson("/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken: response.credential }),
            });

            await completeAuthLogin(data, navigate);
          } catch (error) {
            setMessage(error.message || "Google signup failed");
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
        text: "signup_with",
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
        setMessage("Unable to load Google signup. Try again later.");
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (GOOGLE_ONLY_SIGNUP && isGoogleSignupEnabled) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Sign up is enabled only with Google for secure verified account onboarding.
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-[0.14em] text-slate-400">sign up</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="flex justify-center">
            <div ref={googleButtonRef} />
          </div>
          {!googleReady && (
            <p className="text-center text-xs text-slate-500">
              {statusMessage || "Loading Google signup..."}
            </p>
          )}
        </div>

        {googleReady && statusMessage && (
          <p className="text-center text-xs text-slate-500">{statusMessage}</p>
        )}

        {message && (
          <p
            className={`rounded-2xl px-4 py-3 text-sm ${
              isSuccess
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-red-200 bg-red-50 text-red-600"
            }`}
          >
            {message}
          </p>
        )}

        <p className="pt-1 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-slate-900 hover:text-emerald-700">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setMessage("");
    setIsSuccess(false);
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setMessage("Please enter a valid email address");
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await fetchJson("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: normalizedEmail, password }),
      });

      if (!data?.requiresVerification) {
        setIsSuccess(true);
        setMessage("Account created successfully. Please log in.");
        window.setTimeout(() => navigate("/login"), 900);
        return;
      }

      setIsSuccess(true);
      setPendingVerificationEmail(normalizedEmail);
      setMessage("Verification code sent. Enter OTP to complete signup.");
    } catch (error) {
      setIsSuccess(false);
      setMessage(error.message || "Server error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (isVerifying || !pendingVerificationEmail) return;

    const normalizedOtp = otp.trim();
    if (!normalizedOtp) {
      setIsSuccess(false);
      setMessage("Enter the verification code from your email");
      return;
    }

    try {
      setIsVerifying(true);
      await fetchJson("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingVerificationEmail,
          otp: normalizedOtp,
        }),
      });
      setIsSuccess(true);
      setMessage("Email verified successfully. Redirecting to log in...");
      window.setTimeout(() => navigate("/login"), 900);
    } catch (error) {
      setIsSuccess(false);
      setMessage(error.message || "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Create a doctor account to manage patients, generate diet plans, and track follow-ups in one place.
      </div>

      <AuthTextField
        label="Full Name"
        type="text"
        placeholder="Dr. Your Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

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
        placeholder="Create a strong password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
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

      <button
        type="submit"
        disabled={isSubmitting || Boolean(pendingVerificationEmail)}
        className="w-full rounded-2xl bg-[#111111] py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#1d1d1d] active:scale-[0.99]"
      >
        {isSubmitting ? "Creating..." : "Sign Up"}
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
              {statusMessage || "Loading Google signup..."}
            </p>
          )}
        </div>
      )}

      {googleReady && statusMessage && (
        <p className="text-center text-xs text-slate-500">{statusMessage}</p>
      )}

      {pendingVerificationEmail && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            Enter the OTP sent to <span className="font-semibold">{pendingVerificationEmail}</span>
          </p>
          <AuthTextField
            label="Verification Code"
            type="text"
            placeholder="6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            autoComplete="one-time-code"
          />
          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={isVerifying}
            className="w-full rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-800 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {isVerifying ? "Verifying..." : "Verify Email"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            isSuccess
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      <p className="pt-1 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-slate-900 hover:text-emerald-700">
          Log in
        </Link>
      </p>
    </form>
  );
}

export default SignupForm;
