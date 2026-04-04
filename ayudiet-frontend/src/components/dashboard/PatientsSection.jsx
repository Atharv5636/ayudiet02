import { useState } from "react";
import { fetchJson } from "../../services/api";

function PatientsSection() {
  const [patients, setPatients] = useState([]);
  const [message, setMessage] = useState("");

  const fetchPatients = async () => {
    const token = localStorage.getItem("token");

    try {
      const data = await fetchJson("/patients", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPatients(data.patients);
    } catch (error) {
      setMessage(error.message || "Error fetching patients");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("doctorName");
    window.location.href = "/login";
  };

  return (
  <div className="space-y-6">
    {/* Header */}
    <div className="flex justify-between items-center">
      <h2 className="text-2xl font-bold">Patients</h2>

      <div className="flex gap-3">
        <button
          onClick={fetchPatients}
          className="rounded-md bg-yellow-400 px-4 py-2 font-semibold text-black transition hover:bg-yellow-500"
        >
          Fetch Patients
        </button>

        <button
          onClick={handleLogout}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-800 transition hover:bg-black hover:text-white"
        >
          Logout
        </button>
      </div>
    </div>

    {message && (
      <p className="text-sm text-gray-600">{message}</p>
    )}

    {/* Patients Grid */}
    {patients.length === 0 ? (
      <div className="text-gray-600">
        No patients found
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {patients.map((p) => (
          <div
            key={p._id}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <h3 className="font-semibold">{p.name}</h3>
            <p className="text-sm text-gray-600">
              Age: {p.age}
            </p>
          </div>
        ))}
      </div>
    )}
  </div>
);

}

export default PatientsSection;
