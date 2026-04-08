import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import logo from "../../assets/sidebar-logo.png";
import carouselOne from "../../assets/auth-slide-1.png";
import carouselTwo from "../../assets/auth-slide-2.png";
import carouselThree from "../../assets/auth-slide-3.png";

function AuthShell({
  eyebrow,
  title,
  description,
  panelTitle,
  panelDescription,
  quote,
  quoteAuthor,
  children,
}) {
  const slides = [
    {
      image: carouselOne,
      alt: "Ayurvedic wellness setup",
      tag: "Rituals",
    },
    {
      image: carouselTwo,
      alt: "Ayurvedic spices arranged on wooden surface",
      tag: "Herbs",
    },
    {
      image: carouselThree,
      alt: "Traditional Ayurvedic ingredients",
      tag: "Healing",
    },
  ];
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 3200);

    return () => window.clearInterval(intervalId);
  }, [slides.length]);

  const goToSlide = (index) => {
    setActiveSlide(index);
  };

  const goToPrevious = () => {
    setActiveSlide((current) => (current - 1 + slides.length) % slides.length);
  };

  const goToNext = () => {
    setActiveSlide((current) => (current + 1) % slides.length);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.18),_transparent_28%),linear-gradient(180deg,_#f7f5ef_0%,_#efe9dc_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-[0_20px_80px_rgba(47,58,31,0.14)]">
        <section className="relative flex w-full items-center justify-center px-6 py-10 sm:px-10 lg:w-[54%] lg:px-14 lg:py-14">
          <Link
            to="/"
            className="absolute left-6 top-6 flex w-fit items-center text-sm font-medium text-gray-700 transition hover:text-gray-900 hover:underline sm:left-10 sm:top-8 lg:left-14 lg:top-10"
          >
            {"<- Back to Home"}
          </Link>
          <div className="w-full max-w-md">
            <Link
              to="/"
              className="mb-10 inline-flex items-center gap-3 text-slate-900"
            >
              <img src={logo} alt="AyuDiet" className="h-11 w-11 object-contain" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
                  AyuDiet
                </p>
                <p className="text-sm text-slate-500">Doctor workspace</p>
              </div>
            </Link>

            <div className="mb-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
                {eyebrow}
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.7rem]">
                {title}
              </h1>
              <p className="max-w-sm text-sm leading-6 text-slate-500 sm:text-base">
                {description}
              </p>
            </div>

            {children}
          </div>
        </section>

        <aside className="relative hidden lg:flex lg:w-[46%]">
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="flex h-full w-full transition-transform duration-700 ease-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {slides.map((slide) => (
                <div key={slide.alt} className="relative h-full min-w-full">
                  <img
                    src={slide.image}
                    alt={slide.alt}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(27,18,10,0.18),rgba(18,14,10,0.38)_35%,rgba(10,10,10,0.72)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(211,165,94,0.18),transparent_32%)]" />
          <div className="absolute left-8 top-8 h-28 w-28 rounded-full border border-white/15 bg-white/8 backdrop-blur-md" />
          <div className="absolute right-10 top-16 h-20 w-20 rounded-[28px] border border-white/10 bg-[#d7e7bf]/12 backdrop-blur-sm" />
          <div className="absolute bottom-24 right-10 h-32 w-32 rounded-full border border-white/10 bg-black/10 blur-3xl" />
          <div className="absolute inset-y-0 left-0 z-10 flex items-center pl-5">
            <button
              type="button"
              onClick={goToPrevious}
              aria-label="Previous slide"
              className="rounded-full border border-white/20 bg-black/20 p-3 text-white backdrop-blur-md transition hover:bg-black/35"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="absolute inset-y-0 right-0 z-10 flex items-center pr-5">
            <button
              type="button"
              onClick={goToNext}
              aria-label="Next slide"
              className="rounded-full border border-white/20 bg-black/20 p-3 text-white backdrop-blur-md transition hover:bg-black/35"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="relative z-10 flex min-h-full flex-col justify-between p-10 text-white">
            <div className="rounded-[28px] border border-white/15 bg-white/10 p-5 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
                Clinical nutrition platform
              </p>
              <h2 className="mt-3 max-w-xs text-3xl font-bold leading-tight tracking-tight">
                {panelTitle}
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
                {panelDescription}
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                {slides.map((slide, index) => (
                  <button
                    key={slide.alt}
                    type="button"
                    onClick={() => goToSlide(index)}
                    aria-label={`Show slide ${index + 1}`}
                    className={`h-3 rounded-full transition-all ${
                      index === activeSlide
                        ? "w-12 bg-white"
                        : "w-8 bg-white/25 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>

              <div className="max-w-md rounded-[28px] border border-white/12 bg-black/20 p-6 backdrop-blur-md">
                <div className="mb-4 inline-flex rounded-full border border-white/15 bg-black/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
                  {slides[activeSlide].tag}
                </div>
                <p className="text-sm leading-7 text-white/90">"{quote}"</p>
                <p className="mt-4 text-sm font-medium text-[#dce8c8]">
                  {quoteAuthor}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default AuthShell;
