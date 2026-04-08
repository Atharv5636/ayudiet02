import { Suspense, lazy, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

const Sidebar = lazy(() => import("../dashboard/Sidebar"));
const Topbar = lazy(() => import("../dashboard/Topbar"));

const LayoutLoader = () => (
  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
    Loading...
  </div>
);

function DashboardLayout() {
  const [search, setSearch] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#F5F5F4] text-gray-900">
      <Suspense fallback={<LayoutLoader />}>
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      </Suspense>

      <div
        className={`flex min-h-screen flex-1 flex-col bg-[#F5F5F4] transition-[margin] duration-300 ease-out ${
          isSidebarOpen ? "lg:ml-64" : "ml-0"
        }`}
      >
        <Suspense fallback={<LayoutLoader />}>
          <Topbar
            search={search}
            setSearch={setSearch}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          />
        </Suspense>

        <main className="flex-1 w-full overflow-x-hidden bg-[#F5F5F4] px-3 py-4 sm:px-6 sm:py-8 lg:px-10">
          <div className="w-full max-w-full">
            <Suspense fallback={<LayoutLoader />}>
              <Outlet context={{ search }} />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
