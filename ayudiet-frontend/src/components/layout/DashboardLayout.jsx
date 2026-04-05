import { useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "../dashboard/Sidebar";
import Topbar from "../dashboard/Topbar";

function DashboardLayout() {
  const [search, setSearch] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="relative min-h-screen w-full bg-[#F5F5F4] text-gray-900">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div
        className={`flex min-h-screen flex-1 flex-col bg-[#F5F5F4] transition-[margin] duration-300 ease-out ${
          isSidebarOpen ? "lg:ml-64" : "ml-0"
        }`}
      >
        <Topbar
          search={search}
          setSearch={setSearch}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        <main className="flex-1 w-full bg-[#F5F5F4] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          <div className="w-full">
            <Outlet context={{ search }} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
