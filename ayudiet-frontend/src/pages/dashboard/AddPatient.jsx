import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../../services/api";
import {
  uploadPatientDocument,
  uploadPatientPhoto,
} from "../../services/patient.service";
import BackNavLink from "../../components/common/BackNavLink";

const mockPatientForm = {
  name: "Neha Verma",
  age: "29",
  gender: "female",
  dateOfBirth: "1997-05-14",
  bloodGroup: "B+",
  phone: "9876543210",
  emergencyContactName: "Rahul Verma",
  emergencyContactPhone: "9876500000",
  height: "162",
  weight: "58",
  healthConditions: "Low energy, mild acidity",
  currentMedications: "Vitamin D weekly",
  allergies: "None",
  dominantDosha: "pitta",
  dietType: "vegetarian",
  activityLevel: 3,
  preferences: "Quick meals, Home-cooked food",
  primaryGoal: "muscle gain",
  targetWeight: "61",
  timeframeWeeks: "12",
  mealPattern: "3 meals + 1 snack",
  sleepHours: "6.5",
  stressLevel: "3",
  waterIntakeLiters: "2.2",
  budgetTier: "medium",
  localRegion: "maharashtra",
  wakeUpTime: "06:30",
  breakfastTime: "08:30",
  lunchTime: "13:00",
  eveningSnackTime: "17:30",
  dinnerTime: "20:00",
  bedTime: "22:30",
};

function AddPatient() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
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
    activityLevel: 3,
    preferences: "",
    primaryGoal: "",
    targetWeight: "",
    timeframeWeeks: "",
    mealPattern: "",
    sleepHours: "",
    stressLevel: "3",
    waterIntakeLiters: "",
    budgetTier: "low",
    localRegion: "",
    wakeUpTime: "",
    breakfastTime: "",
    lunchTime: "",
    eveningSnackTime: "",
    dinnerTime: "",
    bedTime: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const fillMockData = () => {
    setForm(mockPatientForm);
    setError("");
  };

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] || null);
    setError("");
  };

  const handlePhotoChange = (event) => {
    setSelectedPhoto(event.target.files?.[0] || null);
    setError("");
  };

  const addMockPatient = async () => {
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const createdPatient = await fetchJson("/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: mockPatientForm.name,
          age: Number(mockPatientForm.age),
          gender: mockPatientForm.gender,
          dateOfBirth: mockPatientForm.dateOfBirth || undefined,
          bloodGroup: mockPatientForm.bloodGroup || undefined,
          phone: mockPatientForm.phone || undefined,
          emergencyContactName: mockPatientForm.emergencyContactName || undefined,
          emergencyContactPhone:
            mockPatientForm.emergencyContactPhone || undefined,
          height: Number(mockPatientForm.height),
          weight: Number(mockPatientForm.weight),
          healthConditions: mockPatientForm.healthConditions,
          currentMedications: mockPatientForm.currentMedications,
          allergies: mockPatientForm.allergies,
          dominantDosha: mockPatientForm.dominantDosha,
          dietType: mockPatientForm.dietType,
          activityLevel: Number(mockPatientForm.activityLevel),
          preferences: mockPatientForm.preferences
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          planningInputs: {
            primaryGoal: mockPatientForm.primaryGoal,
            targetWeight: Number(mockPatientForm.targetWeight),
            timeframeWeeks: Number(mockPatientForm.timeframeWeeks),
            mealPattern: mockPatientForm.mealPattern,
            sleepHours: Number(mockPatientForm.sleepHours),
            stressLevel: Number(mockPatientForm.stressLevel),
            waterIntakeLiters: Number(mockPatientForm.waterIntakeLiters),
            budgetTier: mockPatientForm.budgetTier,
            localRegion: mockPatientForm.localRegion,
            mealTimings: {
              wakeUpTime: mockPatientForm.wakeUpTime || undefined,
              breakfastTime: mockPatientForm.breakfastTime || undefined,
              lunchTime: mockPatientForm.lunchTime || undefined,
              eveningSnackTime: mockPatientForm.eveningSnackTime || undefined,
              dinnerTime: mockPatientForm.dinnerTime || undefined,
              bedTime: mockPatientForm.bedTime || undefined,
            },
          },
        }),
      });

      if (selectedFile && createdPatient?.patient?._id) {
        await uploadPatientDocument(createdPatient.patient._id, selectedFile);
      }
      if (selectedPhoto && createdPatient?.patient?._id) {
        await uploadPatientPhoto(createdPatient.patient._id, selectedPhoto);
      }

      navigate("/dashboard/patients");
    } catch (err) {
      setError(err.message || "Unable to add the mock patient.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name || !form.age || !form.gender) {
      setError("Name, age and gender are required");
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const createdPatient = await fetchJson("/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
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

          dominantDosha: form.dominantDosha,
          dietType: form.dietType,
          activityLevel: Number(form.activityLevel),

          preferences: form.preferences
            ? form.preferences.split(",").map((p) => p.trim())
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
            budgetTier: form.budgetTier || undefined,
            localRegion: form.localRegion || undefined,
            mealTimings: {
              wakeUpTime: form.wakeUpTime || undefined,
              breakfastTime: form.breakfastTime || undefined,
              lunchTime: form.lunchTime || undefined,
              eveningSnackTime: form.eveningSnackTime || undefined,
              dinnerTime: form.dinnerTime || undefined,
              bedTime: form.bedTime || undefined,
            },
          },
        }),
      });

      if (selectedFile && createdPatient?.patient?._id) {
        await uploadPatientDocument(createdPatient.patient._id, selectedFile);
      }
      if (selectedPhoto && createdPatient?.patient?._id) {
        await uploadPatientPhoto(createdPatient.patient._id, selectedPhoto);
      }

      navigate("/dashboard/patients");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <BackNavLink to="/dashboard/patients" label="Back to Patients" />
      <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm transition-all duration-200 hover:shadow-md">
        <h1 className="mb-10 text-center text-2xl font-semibold text-gray-900">
          Add Patient
        </h1>

        <div className="mb-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={fillMockData}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            Fill Mock Data
          </button>
          <button
            type="button"
            onClick={addMockPatient}
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-70"
          >
            {loading ? "Adding Mock..." : "Add Mock Patient"}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <Section title="Basic Information">
            <Input label="Patient Name" name="name" value={form.name} onChange={handleChange} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Age" type="number" name="age" value={form.age} onChange={handleChange} />
              <Select label="Gender" name="gender" value={form.gender} onChange={handleChange}
                options={["male", "female", "other"]}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Input
                label="Date of Birth"
                type="date"
                name="dateOfBirth"
                value={form.dateOfBirth}
                onChange={handleChange}
              />
              <Select
                label="Blood Group"
                name="bloodGroup"
                value={form.bloodGroup}
                onChange={handleChange}
                options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
              />
              <Input label="Phone" name="phone" value={form.phone} onChange={handleChange} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Select
                label="Budget Tier"
                name="budgetTier"
                value={form.budgetTier}
                onChange={handleChange}
                options={["low", "medium", "high"]}
              />
              <Select
                label="Local Region"
                name="localRegion"
                value={form.localRegion}
                onChange={handleChange}
                options={[
                  "maharashtra",
                  "gujarat",
                  "punjab",
                  "rajasthan",
                  "uttar_pradesh",
                  "bihar",
                  "west_bengal",
                  "odisha",
                  "karnataka",
                  "tamil_nadu",
                  "kerala",
                  "andhra_pradesh",
                  "telangana",
                  "assam",
                  "pan_india",
                ]}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Height (cm)" name="height" value={form.height} onChange={handleChange} />
              <Input label="Weight (kg)" name="weight" value={form.weight} onChange={handleChange} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Emergency Contact Name"
                name="emergencyContactName"
                value={form.emergencyContactName}
                onChange={handleChange}
              />
              <Input
                label="Emergency Contact Phone"
                name="emergencyContactPhone"
                value={form.emergencyContactPhone}
                onChange={handleChange}
              />
            </div>
          </Section>

          <Section title="Medical Details">
            <Input
              label="Health Conditions"
              name="healthConditions"
              value={form.healthConditions}
              onChange={handleChange}
            />
            <Input
              label="Current Medications"
              name="currentMedications"
              value={form.currentMedications}
              onChange={handleChange}
            />
            <Input label="Known Allergies" name="allergies" value={form.allergies} onChange={handleChange} />
          </Section>

          <Section title="Ayurvedic Assessment">
            <Select
              label="Dominant Dosha"
              name="dominantDosha"
              value={form.dominantDosha}
              onChange={handleChange}
              options={["vata", "pitta", "kapha"]}
            />
            <Select label="Diet Type" name="dietType" value={form.dietType} onChange={handleChange}
              options={["vegetarian", "non-vegetarian", "vegan"]}
            />

            <Input
              label="Activity Level (1–5)"
              type="number"
              min="1"
              max="5"
              name="activityLevel"
              value={form.activityLevel}
              onChange={handleChange}
            />

            <Input
              label="Preferences"
              name="preferences"
              placeholder="Quick meals, Loves cooking"
              value={form.preferences}
              onChange={handleChange}
            />
          </Section>

          <Section title="Planning Inputs">
            <Select
              label="Primary Goal"
              name="primaryGoal"
              value={form.primaryGoal}
              onChange={handleChange}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Target Weight (kg)"
                type="number"
                name="targetWeight"
                value={form.targetWeight}
                onChange={handleChange}
              />
              <Input
                label="Timeframe (weeks)"
                type="number"
                name="timeframeWeeks"
                value={form.timeframeWeeks}
                onChange={handleChange}
              />
            </div>

            <Input
              label="Meal Pattern"
              name="mealPattern"
              placeholder="3 meals, 1 snack / intermittent fasting / etc."
              value={form.mealPattern}
              onChange={handleChange}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Input
                label="Sleep Hours"
                type="number"
                step="0.5"
                min="0"
                max="12"
                name="sleepHours"
                value={form.sleepHours}
                onChange={handleChange}
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
              />
              <Select
                label="Stress Level (1-5)"
                name="stressLevel"
                value={form.stressLevel}
                onChange={handleChange}
                options={["1", "2", "3", "4", "5"]}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Input
                label="Wake-up Time"
                type="time"
                name="wakeUpTime"
                value={form.wakeUpTime}
                onChange={handleChange}
              />
              <Input
                label="Breakfast Time"
                type="time"
                name="breakfastTime"
                value={form.breakfastTime}
                onChange={handleChange}
              />
              <Input
                label="Lunch Time"
                type="time"
                name="lunchTime"
                value={form.lunchTime}
                onChange={handleChange}
              />
              <Input
                label="Evening Snack Time"
                type="time"
                name="eveningSnackTime"
                value={form.eveningSnackTime}
                onChange={handleChange}
              />
              <Input
                label="Dinner Time"
                type="time"
                name="dinnerTime"
                value={form.dinnerTime}
                onChange={handleChange}
              />
              <Input
                label="Bed Time"
                type="time"
                name="bedTime"
                value={form.bedTime}
                onChange={handleChange}
              />
            </div>
          </Section>

          <Section title="Attachments (Optional)">
            <Input
              label="📷 Upload Patient Photo"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handlePhotoChange}
            />
            <Input
              label="📄 Upload Report PDF"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
            />
          </Section>

          {error && <p className="text-sm text-gray-600">{error}</p>}

          <div className="text-center">
            <button
              disabled={loading}
              className="rounded-md bg-yellow-400 px-4 py-2 font-semibold text-black transition hover:bg-yellow-500"
            >
              {loading ? "Submitting..." : "Submit Assessment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddPatient;

/* ---------------- UI HELPERS ---------------- */

function Section({ title, children }) {
  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <h2 className="text-gray-900 font-semibold">
        {title}
      </h2>
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
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2
        text-sm text-gray-600 placeholder:text-gray-400
        outline-none focus:border-gray-400"
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
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2
        text-sm text-gray-600 outline-none focus:border-gray-400"
      >
        <option value="">Select</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
