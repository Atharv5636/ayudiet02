import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/sidebar-logo.png";
import frameBg from "../assets/abg.png";
import heroEarth from "../assets/hero-earth.png";
import heroNature from "../assets/hero-nature.png";
import heroMindfulness from "../assets/hero-mindfulness.png";

const platformHighlights = [
  {
    title: "Clinical Intake Intelligence",
    description:
      "Capture patient profile, dosha traits, and constraints in one guided flow with consistency checks.",
  },
  {
    title: "Structured Diet Planning",
    description:
      "Generate weekly suggestions with practical meal options aligned to medical context and daily adherence.",
  },
  {
    title: "Progress & Trend Insights",
    description:
      "Track adherence, weight, and energy progression to identify stable, improving, or declining trajectories.",
  },
  {
    title: "Explainable Recommendations",
    description:
      "Every adjustment includes rationale so doctors can review, approve, and communicate confidently.",
  },
];

const workflowSteps = [
  "Register patient and collect medical + Ayurvedic assessment details.",
  "Generate initial weekly meal direction based on profile and priority goals.",
  "Track follow-up logs to measure adherence, weight, and response patterns.",
  "Apply auto-improve suggestions and finalize clinician-approved plans.",
];

const heroSlides = [
  { src: heroEarth, alt: "Mother Earth illustration" },
  { src: heroNature, alt: "Nature benefits illustration" },
  { src: heroMindfulness, alt: "Mindfulness illustration" },
];

function Home() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 2800);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="min-h-screen text-[#1f2937] scroll-smooth"
      style={{
        backgroundImage: `url(${frameBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <header className="sticky top-0 z-30 border-b border-[#e8e2d6] bg-white/95 backdrop-blur">
        <div className="flex h-20 w-full items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <img src={logo} alt="AyuDiet" className="h-12 w-auto object-contain" />
            <span className="text-3xl font-semibold tracking-tight text-[#1f2937]">AyuDiet</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-full border border-[#66a54c] px-6 py-2 text-base font-semibold text-[#2f6b2f] transition hover:bg-[#eff7ea]"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-[#68ad4f] px-6 py-2 text-base font-semibold text-white transition hover:bg-[#5a9d43]"
            >
              Signup
            </Link>
          </div>
        </div>
      </header>

      <main id="home" className="relative overflow-hidden">
        <div className="mx-auto grid min-h-[76vh] w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2">
          <section className="max-w-2xl rounded-2xl bg-white/72 p-6 backdrop-blur-[1px] md:p-8">
            <h1 className="text-4xl font-semibold leading-tight text-[#202938] md:text-5xl">
              AI-Powered Clinical
              <br />
              Ayurveda Platform
            </h1>

            <p className="mt-5 text-2xl leading-snug text-[#0f6f58] md:text-3xl">
              हित मितं च रुच्यं च भोजनं सप्तधातुभृत्।
            </p>

            <ul className="mt-7 space-y-3 text-lg leading-relaxed text-[#0f172a] md:text-xl">
              <li>• Reduce patient assessment time by 70% with AI constitution analysis</li>
              <li>• Access 5,000+ foods with classical citations + modern research</li>
              <li>• Improve adherence with personalized dosha-based planning</li>
              <li>• Evidence transparency for every recommendation</li>
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/signup"
                className="rounded-full bg-[#68ad4f] px-7 py-3 text-base font-semibold text-white transition hover:bg-[#5a9d43] md:text-lg"
              >
                START FREE TRIAL
              </Link>
              <a
                href="#services"
                className="rounded-full bg-[#68ad4f] px-7 py-3 text-base font-semibold text-white transition hover:bg-[#5a9d43] md:text-lg"
              >
                EXPLORE FEATURES
              </a>
            </div>
          </section>

          <section className="flex flex-col items-center justify-center lg:translate-x-16">
            <div className="relative h-[24rem] w-full max-w-xl md:h-[30rem]">
              {heroSlides.map((slide, index) => (
                <img
                  key={slide.alt}
                  src={slide.src}
                  alt={slide.alt}
                  className={`absolute inset-0 h-full w-full object-contain transition-all duration-700 ${
                    activeSlide === index
                      ? "translate-x-0 scale-100 opacity-100"
                      : "pointer-events-none translate-x-4 scale-95 opacity-0"
                  }`}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {heroSlides.map((slide, index) => (
                <button
                  key={`${slide.alt}-dot`}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    activeSlide === index
                      ? "w-7 bg-[#2f6b2f]"
                      : "w-2.5 bg-[#aacfa0] hover:bg-[#8cbf7f]"
                  }`}
                  aria-label={`Show slide ${index + 1}`}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <section id="about" className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="rounded-2xl border border-[#d8d1bf] bg-white/80 p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#6b7280]">About Platform</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#1f2937]">
            Built For Modern Ayurvedic Practice
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#374151]">
            AyuDiet combines structured patient data capture, actionable diet planning,
            and progression-based review. It helps doctors reduce manual overhead while
            preserving clinical judgment and personalization.
          </p>
        </div>
      </section>

      <section id="services" className="mx-auto w-full max-w-7xl px-6 py-4">
        <div className="rounded-2xl border border-[#d8d1bf] bg-white/80 p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#6b7280]">Services</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#1f2937]">Core Capabilities</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {platformHighlights.map((item) => (
              <div key={item.title} className="rounded-xl border border-[#e5dfcf] bg-[#fbfaf6] p-5">
                <p className="text-lg font-semibold text-[#1f2937]">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#4b5563]">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="rounded-2xl border border-[#d8d1bf] bg-white/80 p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#6b7280]">Nutrition Plans</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#1f2937]">Simple Clinical Workflow</h2>
          <div className="mt-6 space-y-4">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-3 rounded-xl border border-[#e5dfcf] bg-[#fbfaf6] p-4">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#68ad4f] text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="text-base text-[#374151]">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto w-full max-w-7xl px-6 pb-14 pt-2">
        <div className="rounded-2xl border border-[#d8d1bf] bg-white/85 p-8 text-center">
          <h2 className="text-3xl font-semibold text-[#1f2937]">
            Ready To Streamline Diet Planning?
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-lg text-[#4b5563]">
            Start with a structured, professional workflow that supports both physician
            efficiency and patient adherence.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="rounded-full bg-[#68ad4f] px-7 py-3 text-base font-semibold text-white transition hover:bg-[#5a9d43]"
            >
              Create Account
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-[#66a54c] px-7 py-3 text-base font-semibold text-[#2f6b2f] transition hover:bg-[#eff7ea]"
            >
              Log In
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
