import {
  LayoutDashboard,
  Users,
  Table2,
  Download,
  LogOut,
  UserPlus,
  UtensilsCrossed,
  MessageSquareText,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/sidebar-logo.png";

function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const DownloadIcon = Download;
  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const closeOnMobileOnly = () => {
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("doctorName");
    navigate("/login");
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          onClick={onClose}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[84vw] max-w-64 border-r border-gray-200 bg-white p-4 text-gray-900 shadow-sm transition-transform duration-300 ease-out lg:w-64 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo Section */}
        <div className="mb-5 flex items-center gap-3 border-b border-gray-100 pb-4">
          <img
            src={logo}
            alt="AyuDiet Logo"
            className="h-16 w-16 object-contain"
          />
          <h1 className="text-xl font-bold">AyuDiet</h1>
        </div>

        <nav className="flex h-[calc(100vh-150px)] flex-col">
          <div className="space-y-1.5">
            <button
              onClick={() => {
                navigate("/dashboard");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard") && location.pathname === "/dashboard"
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>

            <button
              onClick={() => {
                navigate("/dashboard/patients");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard/patients") && !isActive("/dashboard/patients-table")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Users size={18} />
              Patients
            </button>

            <button
              onClick={() => {
                navigate("/dashboard/patients-table");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard/patients-table")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Table2 size={18} />
              Patients Table
            </button>

            <button
              onClick={() => {
                navigate("/dashboard/add-patient");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard/add-patient")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <UserPlus size={18} />
              Add Patient
            </button>

            <button
              onClick={() => {
                navigate("/dashboard/meals-cart");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard/meals-cart")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <UtensilsCrossed size={18} />
              Meals Cart
            </button>

            <button
              onClick={() => {
                navigate("/dashboard/download-plan");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard/download-plan")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <DownloadIcon size={18} />
              Download Plan
            </button>
            <button
              onClick={() => {
                navigate("/dashboard/chatbot");
                closeOnMobileOnly();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                isActive("/dashboard/chatbot")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <MessageSquareText size={18} />
              Chatbot
            </button>
          </div>

          <button
            onClick={logout}
            className="mt-auto flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-gray-600 transition hover:bg-gray-100"
          >
            <LogOut size={18} />
            Logout
          </button>
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
