import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";

const Home = lazy(() => import("../pages/Home"));
const Login = lazy(() => import("../pages/Login"));
const Signup = lazy(() => import("../pages/Signup"));

const DashboardLayout = lazy(() => import("../components/layout/DashboardLayout"));
const Dashboard = lazy(() => import("../pages/dashboard/Dashboard"));
const Patients = lazy(() => import("../pages/dashboard/Patients"));
const PatientsTablePage = lazy(() => import("../pages/dashboard/PatientsTablePage"));
const AddPatient = lazy(() => import("../pages/dashboard/AddPatient"));
const PatientDetails = lazy(() => import("../pages/dashboard/PatientDetails"));
const EditPatient = lazy(() => import("../pages/dashboard/EditPatient"));
const MealLibrary = lazy(() => import("../pages/dashboard/MealLibrary"));
const DownloadPlan = lazy(() => import("../pages/DownloadPlan"));
const Chatbot = lazy(() => import("../pages/dashboard/Chatbot"));

function RouteLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm">
        Loading...
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        {/* PUBLIC */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* PROTECTED */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients-table" element={<PatientsTablePage />} />
            <Route path="meals-cart" element={<MealLibrary />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="download-plan" element={<DownloadPlan />} />
            <Route path="add-patient" element={<AddPatient />} />
            <Route path="patients/:id" element={<PatientDetails />} />
            <Route path="patients/:id/meal-library" element={<MealLibrary />} />
            <Route path="patients/:id/edit" element={<EditPatient />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
