import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Signup from "../pages/Signup";

import ProtectedRoute from "./ProtectedRoute";
import DashboardLayout from "../components/layout/DashboardLayout";

import Dashboard from "../pages/dashboard/Dashboard";
import Patients from "../pages/dashboard/Patients";
import PatientsTablePage from "../pages/dashboard/PatientsTablePage";
import AddPatient from "../pages/dashboard/AddPatient";
import PatientDetails from "../pages/dashboard/PatientDetails";
import EditPatient from "../pages/dashboard/EditPatient";
import DownloadPlan from "../pages/DownloadPlan";

function AppRoutes() {
  return (
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
          <Route path="download-plan" element={<DownloadPlan />} />
          <Route path="add-patient" element={<AddPatient />} />
          <Route path="patients/:id" element={<PatientDetails />} />
          <Route path="patients/:id/edit" element={<EditPatient />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default AppRoutes;
