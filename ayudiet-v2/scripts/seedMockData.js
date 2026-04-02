const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("../src/config/db");
const Doctor = require("../src/models/doctor.model");
const Patient = require("../src/models/patient.model");
const Plan = require("../src/models/plan.model");
const ProgressLog = require("../src/models/progressLog.model");
const { modifyPlanBasedOnProgress } = require("../src/services/adaptivePlanService");

const doctorEmailArg = process.argv.find((arg) =>
  arg.startsWith("--doctorEmail=")
);
const doctorEmailFromArg = doctorEmailArg
  ? doctorEmailArg.split("=")[1]?.trim()
  : "";
const DOCTOR_EMAIL =
  doctorEmailFromArg ||
  process.env.SEED_DOCTOR_EMAIL ||
  process.env.DOCTOR_EMAIL ||
  "drsharma@gmail.com";

const MOCK_PATIENTS = [
  {
    name: "Rohit Sharma",
    age: 35,
    gender: "male",
    baseWeight: 92,
    caseType: "good_improving",
  },
  {
    name: "Anita Verma",
    age: 28,
    gender: "female",
    baseWeight: 74,
    caseType: "bad_adherence_declining",
  },
  {
    name: "Karan Patel",
    age: 40,
    gender: "male",
    baseWeight: 86,
    caseType: "low_energy",
  },
  {
    name: "Meera Singh",
    age: 30,
    gender: "female",
    baseWeight: 69,
    caseType: "no_progress",
  },
  {
    name: "Vikas Gupta",
    age: 45,
    gender: "male",
    baseWeight: 94,
    caseType: "low_adherence_improving",
  },
  {
    name: "Pooja Nair",
    age: 33,
    gender: "female",
    baseWeight: 71,
    caseType: "mixed_decline",
  },
];

const GOALS = ["lose", "gain", "maintain"];
const DOSHAS = ["vata", "pitta", "kapha"];

const pickRandom = (items = []) => items[Math.floor(Math.random() * items.length)];

const daysAgo = (n) => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
};

const buildMeals = (goal) => [
  {
    day: "Day 1",
    breakfast: goal === "gain" ? "banana shake and nuts" : "poha and fruit",
    lunch: "dal, roti, salad",
    dinner: "khichdi and curd",
  },
  {
    day: "Day 2",
    breakfast: "idli and sambar",
    lunch: "rice, rajma, vegetables",
    dinner: "millet roti and paneer sabzi",
  },
  {
    day: "Day 3",
    breakfast: "oats and seeds",
    lunch: "quinoa pulao and curd",
    dinner: "soup and stir-fry vegetables",
  },
];

const buildWeightSeries = (baseWeight, caseType, goal) => {
  if (caseType === "no_progress") {
    return [baseWeight, baseWeight + 0.1, baseWeight - 0.1, baseWeight, baseWeight + 0.1, baseWeight];
  }

  if (caseType === "good_improving") {
    if (goal === "gain") return [baseWeight, baseWeight + 0.4, baseWeight + 0.8, baseWeight + 1.1, baseWeight + 1.5, baseWeight + 1.9];
    if (goal === "maintain") return [baseWeight, baseWeight - 0.2, baseWeight, baseWeight + 0.2, baseWeight, baseWeight - 0.1];
    return [baseWeight, baseWeight - 0.5, baseWeight - 1.0, baseWeight - 1.4, baseWeight - 1.8, baseWeight - 2.2];
  }

  if (caseType === "bad_adherence_declining") {
    if (goal === "gain") return [baseWeight, baseWeight + 0.1, baseWeight, baseWeight - 0.1, baseWeight - 0.2, baseWeight - 0.3];
    if (goal === "maintain") return [baseWeight, baseWeight + 0.2, baseWeight - 0.1, baseWeight + 0.1, baseWeight - 0.2, baseWeight];
    return [baseWeight, baseWeight - 0.1, baseWeight, baseWeight + 0.1, baseWeight + 0.2, baseWeight + 0.3];
  }

  if (caseType === "low_energy") {
    if (goal === "gain") return [baseWeight, baseWeight + 0.1, baseWeight + 0.2, baseWeight + 0.2, baseWeight + 0.3, baseWeight + 0.4];
    if (goal === "maintain") return [baseWeight, baseWeight + 0.1, baseWeight, baseWeight, baseWeight - 0.1, baseWeight];
    return [baseWeight, baseWeight - 0.2, baseWeight - 0.3, baseWeight - 0.5, baseWeight - 0.6, baseWeight - 0.7];
  }

  if (caseType === "low_adherence_improving") {
    if (goal === "gain") return [baseWeight, baseWeight + 0.1, baseWeight + 0.3, baseWeight + 0.4, baseWeight + 0.6, baseWeight + 0.9];
    if (goal === "maintain") return [baseWeight, baseWeight - 0.2, baseWeight, baseWeight + 0.1, baseWeight + 0.1, baseWeight];
    return [baseWeight, baseWeight - 0.2, baseWeight - 0.4, baseWeight - 0.6, baseWeight - 0.8, baseWeight - 1.1];
  }

  if (goal === "gain") return [baseWeight, baseWeight - 0.1, baseWeight - 0.1, baseWeight - 0.2, baseWeight - 0.3, baseWeight - 0.4];
  if (goal === "maintain") return [baseWeight, baseWeight + 0.1, baseWeight - 0.1, baseWeight - 0.1, baseWeight, baseWeight];
  return [baseWeight, baseWeight + 0.1, baseWeight + 0.3, baseWeight + 0.4, baseWeight + 0.5, baseWeight + 0.6];
};

const buildAdherenceSeries = (caseType) => {
  if (caseType === "good_improving") return [72, 78, 83, 87, 91, 94];
  if (caseType === "bad_adherence_declining") return [58, 55, 52, 48, 45, 42];
  if (caseType === "low_energy") return [74, 73, 72, 71, 70, 70];
  if (caseType === "no_progress") return [68, 70, 69, 71, 70, 72];
  if (caseType === "low_adherence_improving") return [42, 45, 48, 52, 56, 59];
  return [66, 63, 60, 57, 54, 50];
};

const buildEnergySeries = (caseType) => {
  if (caseType === "good_improving") return [4, 4, 4, 5, 5, 5];
  if (caseType === "bad_adherence_declining") return [3, 3, 3, 3, 2, 2];
  if (caseType === "low_energy") return [2, 2, 2, 1, 2, 1];
  if (caseType === "no_progress") return [3, 3, 4, 3, 4, 3];
  if (caseType === "low_adherence_improving") return [3, 3, 3, 4, 4, 4];
  return [3, 3, 2, 2, 2, 2];
};

const buildDigestionSeries = (caseType) => {
  if (caseType === "good_improving") return ["good", "good", "good", "good", "good", "good"];
  if (caseType === "bad_adherence_declining") return ["bad", "bad", "bad", "bad", "bad", "bad"];
  if (caseType === "low_energy") return ["good", "good", "bad", "bad", "bad", "bad"];
  if (caseType === "no_progress") return ["good", "good", "good", "good", "good", "good"];
  if (caseType === "low_adherence_improving") return ["bad", "bad", "good", "good", "good", "good"];
  return ["bad", "bad", "bad", "bad", "good", "bad"];
};

const buildNotes = (caseType) => {
  if (caseType === "good_improving") return "Patient following plan well and feeling better.";
  if (caseType === "bad_adherence_declining") return "Frequent skips and irregular meal timing.";
  if (caseType === "low_energy") return "Reported persistent fatigue despite adherence.";
  if (caseType === "no_progress") return "Stable habits but no measurable outcome yet.";
  if (caseType === "low_adherence_improving") return "Adherence improving gradually over the week.";
  return "Mixed signals with slight decline in consistency.";
};

const buildProgressLogs = ({ patientId, planId, doctorId, baseWeight, caseType, goal }) => {
  const adherence = buildAdherenceSeries(caseType);
  const energy = buildEnergySeries(caseType);
  const digestion = buildDigestionSeries(caseType);
  const weights = buildWeightSeries(baseWeight, caseType, goal);

  return adherence.map((adherenceValue, index) => {
    const createdAt = daysAgo(12 - index * 2);
    return {
      patient: patientId,
      plan: planId,
      doctor: doctorId,
      isMock: true,
      weight: Number(weights[index].toFixed(1)),
      adherence: adherenceValue,
      energyLevel: energy[index],
      digestion: digestion[index],
      notes: buildNotes(caseType),
      createdAt,
      updatedAt: createdAt,
    };
  });
};

const main = async () => {
  await connectDB();

  try {
    const doctor = await Doctor.findOne({
      email: DOCTOR_EMAIL,
    });

    if (!doctor) {
      throw new Error(
        `Doctor not found for email "${DOCTOR_EMAIL}". Login with this account first or pass --doctorEmail=<email>.`
      );
    }

    console.log(`Seeding mock data for doctor: ${DOCTOR_EMAIL}`);

    const existingPatients = await Patient.find({
      doctor: doctor._id,
      isMock: true,
    }).select("_id");
    const existingPatientIds = existingPatients.map((patient) => patient._id);

    if (existingPatientIds.length) {
      await ProgressLog.deleteMany({
        patient: { $in: existingPatientIds },
      });
      await Plan.deleteMany({
        patient: { $in: existingPatientIds },
      });
      await Patient.deleteMany({
        _id: { $in: existingPatientIds },
      });
    }

    const now = new Date();
    const results = [];

    for (const patientSeed of MOCK_PATIENTS) {
      const goal = pickRandom(GOALS);
      const doshaType = pickRandom(DOSHAS);
      const startDate = daysAgo(14);
      const reviewDueDate = new Date(now);
      reviewDueDate.setDate(reviewDueDate.getDate() + 14);

      const patient = await Patient.create({
        name: patientSeed.name,
        age: patientSeed.age,
        gender: patientSeed.gender,
        weight: patientSeed.baseWeight,
        doctor: doctor._id,
        isMock: true,
        dietType: "vegetarian",
        activityLevel: 3,
        preferences: ["low oil", "home cooked"],
        prakriti: {
          dominantDosha: doshaType,
        },
      });

      const plan = await Plan.create({
        doctor: doctor._id,
        patient: patient._id,
        isMock: true,
        title: `${patientSeed.name} ${goal} plan`,
        doshaType,
        meals: buildMeals(goal),
        startDate,
        reviewDueDate,
        isActive: true,
        status: "approved",
      });

      const progressLogs = buildProgressLogs({
        patientId: patient._id,
        planId: plan._id,
        doctorId: doctor._id,
        baseWeight: patientSeed.baseWeight,
        caseType: patientSeed.caseType,
        goal,
      });

      await ProgressLog.insertMany(progressLogs);

      const analysisResult = await modifyPlanBasedOnProgress(patient._id);

      results.push({
        patient: patient.name,
        goal,
        caseType: patientSeed.caseType,
        logCount: progressLogs.length,
        primaryIssue: analysisResult?.analysis?.primaryIssue,
        trend: analysisResult?.analysis?.trend,
        effectiveness: analysisResult?.analysis?.effectiveness,
      });
    }

    console.log("Mock seeding complete.");
    console.table(results);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
};

main();
