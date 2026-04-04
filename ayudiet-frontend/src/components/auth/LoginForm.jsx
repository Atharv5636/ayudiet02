import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../../services/api";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const data = await fetchJson("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem("token", data.token);
      const doctorNameFromLogin =
        data?.doctor?.name || (email.includes("@") ? email.split("@")[0] : "");
      if (doctorNameFromLogin) {
        localStorage.setItem("doctorName", doctorNameFromLogin);
      }
      navigate("/dashboard");
    } catch (error) {
      setMessage(error.message || "Server error");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-3xl bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 p-8 shadow-2xl"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          Welcome Back
        </h1>
        <p className="text-sm text-neutral-400 mt-2">
          Continue your holistic health journey
        </p>
      </div>

      <div className="mb-5">
        <label className="block text-sm text-neutral-300 mb-2">
          Email address
        </label>
        <input
          type="email"
          placeholder="you@example.com"
          className="w-full rounded-xl bg-neutral-800 px-4 py-3 text-white placeholder-neutral-500
          outline-none border border-neutral-700
          focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm text-neutral-300 mb-2">
          Password
        </label>
        <input
          type="password"
          placeholder="password"
          className="w-full rounded-xl bg-neutral-800 px-4 py-3 text-white placeholder-neutral-500
          outline-none border border-neutral-700
          focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-500
        py-3 text-white font-medium tracking-wide
        hover:from-green-500 hover:to-emerald-400
        active:scale-[0.98] transition-all"
      >
        Log In
      </button>

      {message && (
        <p className="text-red-400 text-sm mt-5 text-center">{message}</p>
      )}
    </form>
  );
}

export default LoginForm;
