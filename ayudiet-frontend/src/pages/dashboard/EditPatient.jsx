import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BackNavLink from "../../components/common/BackNavLink";
import {
  deletePatientPhoto,
  deletePatientDocument,
  fetchPatientById,
  openPatientDocument,
  uploadPatientPhoto,
  updatePatient,
  uploadPatientDocument,
} from "../../services/patient.service";

function formatDateForInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

const initialForm = {
  name: "",
  age: "",
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  phone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  height: "",
  weight: "",
  healthConditions: "",
  currentMedications: "",
  allergies: "",
  dominantDosha: "",
  dietType: "",
  activityLevel: "3",
  preferences: "",
  primaryGoal: "",
  targetWeight: "",
  timeframeWeeks: "",
  mealPattern: "",
  sleepHours: "",
  stressLevel: "3",
  waterIntakeLiters: "",
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
  const [documents, setDocuments] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState("");
  const [documentError, setDocumentError] = useState("");

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

        const patient = await fetchPatientById(id);

        setForm({
          name: patient?.name || "",
          age: patient?.age?.toString() || "",
          gender: patient?.gender || "",
          dateOfBirth: formatDateForInput(patient?.dateOfBirth),
          bloodGroup: patient?.bloodGroup || "",
          phone: patient?.phone || "",
          emergencyContactName: patient?.emergencyContactName || "",
          emergencyContactPhone: patient?.emergencyContactPhone || "",
          height: patient?.height?.toString() || "",
          weight: patient?.weight?.toString() || "",
          healthConditions: patient?.healthConditions || "",
          currentMedications: patient?.currentMedications || "",
          allergies: patient?.allergies || "",
          dominantDosha: patient?.prakriti?.dominantDosha || "",
          dietType: patient?.dietType || "",
          activityLevel: patient?.activityLevel?.toString() || "3",
          preferences: Array.isArray(patient?.preferences)
            ? patient.preferences.join(", ")
            : "",
          primaryGoal: patient?.planningInputs?.primaryGoal || "",
          targetWeight: patient?.planningInputs?.targetWeight?.toString() || "",
          timeframeWeeks:
            patient?.planningInputs?.timeframeWeeks?.toString() || "",
          mealPattern: patient?.planningInputs?.mealPattern || "",
          sleepHours: patient?.planningInputs?.sleepHours?.toString() || "",
          stressLevel: patient?.planningInputs?.stressLevel?.toString() || "3",
          waterIntakeLiters:
            patient?.planningInputs?.waterIntakeLiters?.toString() || "",
        });
        setDocuments(Array.isArray(patient?.documents) ? patient.documents : []);
        setPhoto(patient?.photo || null);
      } catch (err) {
        setFetchError(err.message || "Unable to load patient details.");
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
    navigate("/dashboard/patients");
  }

  function handleDocumentFileChange(event) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setDocumentError("");
  }

  function handlePhotoFileChange(event) {
    const file = event.target.files?.[0] || null;
    setSelectedPhotoFile(file);
    setDocumentError("");
  }

  const resolvePhotoUrl = (photoData) => {
    const raw = String(photoData?.url || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/g, "");
    if (!base) return raw;
    return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
  };

  async function handleUploadPhoto() {
    if (!id) {
      setDocumentError("Missing patient ID");
      return;
    }

    if (!selectedPhotoFile) {
      setDocumentError("Please choose an image file");
      return;
    }

    setUploadingPhoto(true);
    setDocumentError("");

    try {
      const result = await uploadPatientPhoto(id, selectedPhotoFile);
      setPhoto(result?.patient?.photo || result?.photo || null);
      setSelectedPhotoFile(null);
      const inputEl = document.getElementById("patient-photo-upload");
      if (inputEl) inputEl.value = "";
    } catch (err) {
      setDocumentError(err.message || "Unable to upload patient photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleDeletePhoto() {
    if (!id) return;
    setDeletingPhoto(true);
    setDocumentError("");

    try {
      const updatedPatient = await deletePatientPhoto(id);
      setPhoto(updatedPatient?.photo || null);
    } catch (err) {
      setDocumentError(err.message || "Unable to delete patient photo.");
    } finally {
      setDeletingPhoto(false);
    }
  }

  async function handleUploadDocument() {
    if (!id) {
      setDocumentError("Missing patient ID");
      return;
    }

    if (!selectedFile) {
      setDocumentError("Please choose a PDF file");
      return;
    }

    setUploadingDoc(true);
    setDocumentError("");

    try {
      const result = await uploadPatientDocument(id, selectedFile);
      setDocuments(Array.isArray(result?.patient?.documents) ? result.patient.documents : []);
      setSelectedFile(null);
      const inputEl = document.getElementById("patient-document-upload");
      if (inputEl) {
        inputEl.value = "";
      }
    } catch (err) {
      setDocumentError(err.message || "Unable to upload the document.");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDeleteDocument(documentId) {
    if (!id || !documentId) {
      return;
    }

    setDeletingDocId(documentId);
    setDocumentError("");

    try {
      const updatedPatient = await deletePatientDocument(id, documentId);
      setDocuments(
        Array.isArray(updatedPatient?.documents) ? updatedPatient.documents : []
      );
    } catch (err) {
      setDocumentError(err.message || "Unable to delete the document.");
    } finally {
      setDeletingDocId("");
    }
  }

  async function handleOpenDocument(documentId) {
    if (!id || !documentId) {
      return;
    }

    try {
      await openPatientDocument(id, documentId);
    } catch (err) {
      setDocumentError(err.message || "Unable to open the document.");
    }
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

    try {
      setSaving(true);

      await updatePatient(id, {
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth || undefined,
        bloodGroup: form.bloodGroup || undefined,
        phone: form.phone || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        height: form.height ? Number(form.height) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        healthConditions: form.healthConditions,
        currentMedications: form.currentMedications,
        allergies: form.allergies,
        prakriti: {
          dominantDosha: form.dominantDosha || undefined,
        },
        dietType: form.dietType || undefined,
        activityLevel: form.activityLevel ? Number(form.activityLevel) : 3,
        preferences: form.preferences
          ? form.preferences
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
        planningInputs: {
          primaryGoal: form.primaryGoal || undefined,
          targetWeight: form.targetWeight ? Number(form.targetWeight) : undefined,
          timeframeWeeks: form.timeframeWeeks
            ? Number(form.timeframeWeeks)
            : undefined,
          mealPattern: form.mealPattern || undefined,
          sleepHours: form.sleepHours ? Number(form.sleepHours) : undefined,
          stressLevel: form.stressLevel ? Number(form.stressLevel) : undefined,
          waterIntakeLiters: form.waterIntakeLiters
            ? Number(form.waterIntakeLiters)
            : undefined,
        },
      });

      navigate("/dashboard/patients", { replace: true });
    } catch (err) {
      setSubmitError(err.message || "Unable to update patient details.");
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-200 hover:shadow-md md:p-10">
          <BackNavLink to="/dashboard/patients" label="Back to Patients" className="mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
          <p className="mt-3 text-sm text-red-600">
            Missing patient ID. Please return to the patients list and try
            again.
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
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
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-200 hover:shadow-md md:p-10">
          <BackNavLink to="/dashboard/patients" label="Back to Patients" className="mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
          <p className="mt-3 text-sm text-gray-600">Loading patient details...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-200 hover:shadow-md md:p-10">
          <div className="space-y-4">
            <BackNavLink to="/dashboard/patients" label="Back to Patients" />
            <h1 className="text-2xl font-semibold text-gray-900">Edit Patient</h1>
            <p className="text-sm text-red-600">{fetchError}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-500"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
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
    <div className="w-full space-y-4">
      <BackNavLink
        to={id ? `/dashboard/patients/${id}` : "/dashboard/patients"}
        label={id ? "Back to Patient Profile" : "Back to Patients"}
      />
      <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm transition-all duration-200 hover:shadow-md">
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">Edit Patient</h1>
        <p className="mb-8 text-sm text-gray-600">
          Update the full patient profile and save your changes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-10">
          <Section title="Basic Information">
            <Input
              label="Patient Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              disabled={saving}
            />
            {validationErrors.name && (
              <p className="-mt-1 text-sm text-red-600">{validationErrors.name}</p>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Input
                label="Age"
                type="number"
                name="age"
                min="1"
                value={form.age}
                onChange={handleChange}
                disabled={saving}
              />
              <Select
                label="Gender"
                name="gender"
                value={form.gender}
                onChange={handleChange}
                disabled={saving}
                options={["male", "female", "other"]}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Input
                label="Date of Birth"
                type="date"
                name="dateOfBirth"
                value={form.dateOfBirth}
                onChange={handleChange}
                disabled={saving}
              />
              <Select
                label="Blood Group"
                name="bloodGroup"
                value={form.bloodGroup}
                onChange={handleChange}
                disabled={saving}
                options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
              />
              <Input
                label="Phone"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            {(validationErrors.age || validationErrors.gender) && (
              <div className="-mt-1 space-y-1 text-sm text-red-600">
                {validationErrors.age && <p>{validationErrors.age}</p>}
                {validationErrors.gender && <p>{validationErrors.gender}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Input
                label="Height (cm)"
                type="number"
                name="height"
                value={form.height}
                onChange={handleChange}
                disabled={saving}
              />
              <Input
                label="Weight (kg)"
                type="number"
                name="weight"
                value={form.weight}
                onChange={handleChange}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Input
                label="Emergency Contact Name"
                name="emergencyContactName"
                value={form.emergencyContactName}
                onChange={handleChange}
                disabled={saving}
              />
              <Input
                label="Emergency Contact Phone"
                name="emergencyContactPhone"
                value={form.emergencyContactPhone}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </Section>

          <Section title="Medical Details">
            <Input
              label="Health Conditions"
              name="healthConditions"
              value={form.healthConditions}
              onChange={handleChange}
              disabled={saving}
            />
            <Input
              label="Current Medications"
              name="currentMedications"
              value={form.currentMedications}
              onChange={handleChange}
              disabled={saving}
            />
            <Input
              label="Known Allergies"
              name="allergies"
              value={form.allergies}
              onChange={handleChange}
              disabled={saving}
            />
          </Section>

          <Section title="Ayurvedic Assessment">
            <Select
              label="Dominant Dosha"
              name="dominantDosha"
              value={form.dominantDosha}
              onChange={handleChange}
              disabled={saving}
              options={["vata", "pitta", "kapha"]}
            />
            <Select
              label="Diet Type"
              name="dietType"
              value={form.dietType}
              onChange={handleChange}
              disabled={saving}
              options={["vegetarian", "non-vegetarian", "vegan"]}
            />
            <Input
              label="Activity Level (1-5)"
              type="number"
              min="1"
              max="5"
              name="activityLevel"
              value={form.activityLevel}
              onChange={handleChange}
              disabled={saving}
            />
            <Input
              label="Preferences"
              name="preferences"
              placeholder="Quick meals, Home-cooked food"
              value={form.preferences}
              onChange={handleChange}
              disabled={saving}
            />
          </Section>

          <Section title="Planning Inputs">
            <Select
              label="Primary Goal"
              name="primaryGoal"
              value={form.primaryGoal}
              onChange={handleChange}
              disabled={saving}
              options={[
                "weight loss",
                "muscle gain",
                "blood sugar control",
                "diabetes support",
                "pcos support",
                "thyroid support",
                "hypertension support",
                "better digestion",
                "general wellness",
              ]}
            />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Input
                label="Target Weight (kg)"
                type="number"
                name="targetWeight"
                value={form.targetWeight}
                onChange={handleChange}
                disabled={saving}
              />
              <Input
                label="Timeframe (weeks)"
                type="number"
                name="timeframeWeeks"
                value={form.timeframeWeeks}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <Input
              label="Meal Pattern"
              name="mealPattern"
              placeholder="3 meals + 1 snack"
              value={form.mealPattern}
              onChange={handleChange}
              disabled={saving}
            />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Input
                label="Sleep Hours"
                type="number"
                step="0.5"
                min="0"
                max="12"
                name="sleepHours"
                value={form.sleepHours}
                onChange={handleChange}
                disabled={saving}
              />
              <Input
                label="Water Intake (L/day)"
                type="number"
                step="0.1"
                min="0"
                max="10"
                name="waterIntakeLiters"
                value={form.waterIntakeLiters}
                onChange={handleChange}
                disabled={saving}
              />
              <Select
                label="Stress Level (1-5)"
                name="stressLevel"
                value={form.stressLevel}
                onChange={handleChange}
                disabled={saving}
                options={["1", "2", "3", "4", "5"]}
              />
            </div>
          </Section>

          <Section title="Attachments (PDF)">
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-900">Patient Photo</p>
              {photo?.url ? (
                <img
                  src={resolvePhotoUrl(photo)}
                  alt="Patient profile"
                  className="h-24 w-24 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-gray-300 text-xs text-gray-500">
                  No photo
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                <Input
                  id="patient-photo-upload"
                  label="📷 Upload Patient Photo"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handlePhotoFileChange}
                  disabled={uploadingPhoto || saving}
                />
                <button
                  type="button"
                  onClick={handleUploadPhoto}
                  disabled={!selectedPhotoFile || uploadingPhoto || saving}
                  className="h-10 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {uploadingPhoto ? "Uploading..." : "Upload Photo"}
                </button>
                <button
                  type="button"
                  onClick={handleDeletePhoto}
                  disabled={!photo?.url || deletingPhoto || saving}
                  className="h-10 rounded-md border border-red-200 px-4 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingPhoto ? "Removing..." : "Remove Photo"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <Input
                id="patient-document-upload"
                label="📄 Upload Report PDF"
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleDocumentFileChange}
                disabled={uploadingDoc || saving}
              />
              <button
                type="button"
                onClick={handleUploadDocument}
                disabled={!selectedFile || uploadingDoc || saving}
                className="h-10 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
              >
                {uploadingDoc ? "Uploading..." : "Upload PDF"}
              </button>
            </div>

            {documentError && <p className="text-sm text-red-600">{documentError}</p>}

            <div className="space-y-2">
              {documents.length === 0 ? (
                <p className="text-sm text-gray-500">No documents uploaded yet.</p>
              ) : (
                documents.map((doc) => {
                  return (
                    <div
                      key={doc?._id || doc?.filename}
                      className="flex items-center justify-between gap-4 rounded-md border border-gray-200 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenDocument(doc?._id)}
                        disabled={!doc?._id}
                        className="truncate text-left text-sm text-gray-700 underline underline-offset-2 disabled:opacity-60"
                      >
                        {doc?.originalName || doc?.filename || "PDF Document"}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDocument(doc?._id)}
                          disabled={!doc?._id}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc?._id)}
                          disabled={!doc?._id || deletingDocId === doc?._id}
                          className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          {deletingDocId === doc?._id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-70"
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

function Section({ title, children }) {
  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
        {label}
      </label>
      <input
        {...props}
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 placeholder:text-gray-400 outline-none focus:border-gray-400"
      />
    </div>
  );
}

function Select({ label, options, ...props }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
        {label}
      </label>
      <select
        {...props}
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 outline-none focus:border-gray-400"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
