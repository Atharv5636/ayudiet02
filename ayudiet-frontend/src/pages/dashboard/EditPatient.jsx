import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchPatientById,
  updatePatient,
} from "../../services/patient.service";

const initialForm = {
  name: "",
  age: "",
  gender: "",
};

function EditPatient() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});

  console.log("Edit ID:", id);

  useEffect(() => {
    async function loadPatient() {
      if (!id) {
        setFetchError("Missing patient ID in route");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setFetchError("");

        console.log("Fetching patient for edit:", id);

        const patient = await fetchPatientById(id);

        setForm({
          name: patient?.name || "",
          age: patient?.age?.toString() || "",
          gender: patient?.gender || "",
        });
      } catch (err) {
        setFetchError(err.message || "Failed to load patient");
      } finally {
        setLoading(false);
      }
    }

    loadPatient();
  }, [id]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setValidationErrors((current) => ({
      ...current,
      [name]: "",
    }));
    setSubmitError("");
  }

  function validateForm() {
    const nextErrors = {};
    const trimmedName = form.name.trim();
    const parsedAge = Number(form.age);

    if (!trimmedName) {
      nextErrors.name = "Name is required";
    }

    if (!form.age || Number.isNaN(parsedAge) || parsedAge <= 0) {
      nextErrors.age = "Age must be greater than 0";
    }

    if (!form.gender) {
      nextErrors.gender = "Gender is required";
    }

    setValidationErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleCancel() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/dashboard", { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitError("");

    if (!id) {
      setSubmitError("Missing patient ID in route");
      return;
    }

    if (!validateForm()) {
      return;
    }

    const trimmedName = form.name.trim();
    const parsedAge = Number(form.age);

    try {
      setSaving(true);

      await updatePatient(id, {
        name: trimmedName,
        age: parsedAge,
        gender: form.gender,
      });

      console.log("Updated patient successfully:", id);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setSubmitError(err.message || "Failed to update patient");
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border-[2px] border-red-200 bg-[#FFFDF8] p-8 shadow-sm md:p-10">
          <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
          <p className="mt-3 text-sm text-red-600">
            Missing patient ID. Please return to the dashboard and try again.
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="mt-5 rounded-xl border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition hover:bg-gray-100"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border-[2px] border-gray-300/60 bg-[#FFFDF8] p-8 shadow-sm md:p-10">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
            <p className="text-sm text-gray-600">Loading patient details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border-[2px] border-red-200 bg-[#FFFDF8] p-8 shadow-sm md:p-10">
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
            <p className="text-sm text-red-600">{fetchError}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-green-600 px-6 py-2.5 font-medium text-white transition hover:bg-green-700"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border-[2px] border-gray-300/60 bg-[#FFFDF8] p-8 shadow-sm md:p-10">
        <div className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
          <p className="text-sm text-gray-600">
            Update the patient profile details and save the changes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <label className="block">
            <span className="mb-2 block text-sm text-gray-700">
              Patient Name
            </span>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              disabled={saving}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none focus:border-green-500"
            />
            {validationErrors.name && (
              <p className="mt-2 text-sm text-red-600">{validationErrors.name}</p>
            )}
          </label>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-gray-700">Age</span>
              <input
                name="age"
                type="number"
                min="0"
                value={form.age}
                onChange={handleChange}
                disabled={saving}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none focus:border-green-500"
              />
              {validationErrors.age && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.age}</p>
              )}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-700">Gender</span>
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                disabled={saving}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none focus:border-green-500"
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {validationErrors.gender && (
                <p className="mt-2 text-sm text-red-600">
                  {validationErrors.gender}
                </p>
              )}
            </label>
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-green-600 px-6 py-2.5 font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-xl border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-70"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditPatient;
