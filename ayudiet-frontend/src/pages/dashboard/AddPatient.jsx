import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../../services/api";

const mockPatientForm = {
  name: "Neha Verma",
  age: "29",
  gender: "female",
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
};

function AddPatient() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "",
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
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const fillMockData = () => {
    setForm(mockPatientForm);
    setError("");
  };

  const addMockPatient = async () => {
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      await fetchJson("/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: mockPatientForm.name,
          age: Number(mockPatientForm.age),
          gender: mockPatientForm.gender,
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
          },
        }),
      });

      navigate("/dashboard/patients");
    } catch (err) {
      setError(err.message || "Failed to add mock patient");
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

      await fetchJson("/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          age: Number(form.age),
          gender: form.gender,

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
          },
        }),
      });

      navigate("/dashboard/patients");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Height (cm)" name="height" value={form.height} onChange={handleChange} />
              <Input label="Weight (kg)" name="weight" value={form.weight} onChange={handleChange} />
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
