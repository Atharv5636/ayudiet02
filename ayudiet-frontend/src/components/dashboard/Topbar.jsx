import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

function Topbar({ search, setSearch, isSidebarOpen, onToggleSidebar }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("doctorName");
    navigate("/login");
  };

  return (
    <header
      className="sticky top-0 z-40 h-16 px-6 flex items-center justify-between
      bg-white border-b border-gray-200"
    >
      {/* LEFT */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
          onClick={onToggleSidebar}
          className="rounded-md border border-gray-300 bg-white p-2 text-gray-800 transition hover:bg-black hover:text-white"
        >
          {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <h1 className="text-sm text-gray-600">Welcome back, Doctor</h1>
      </div>

      {/* CENTER: SEARCH */}
      <input
        type="text"
        placeholder="Search patients..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-4 py-2
        text-sm text-gray-600 outline-none focus:border-gray-400 w-64"
      />

      {/* RIGHT */}
      <button
        onClick={handleLogout}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
      >
        Logout
      </button>
    </header>
  );
}

export default Topbar;
