const { buildHealthProfile, calculateBmi, calculateBmr, calculateTdee } = require("../healthEngineService");

describe("healthEngineService formulas", () => {
  test("calculates BMI correctly", () => {
    expect(calculateBmi(58, 162)).toBe(22.1);
  });

  test("calculates BMR using Mifflin St Jeor for male", () => {
    expect(calculateBmr({ weightKg: 70, heightCm: 175, age: 30, gender: "male" })).toBe(1649);
  });

  test("calculates TDEE correctly", () => {
    expect(calculateTdee(1600, 1.55)).toBe(2480);
  });
});

describe("healthEngineService profile enrichment", () => {
  test("returns enriched health profile for weight loss goal", () => {
    const userProfile = {
      age: 29,
      gender: "female",
      heightCm: 162,
      weightKg: 58,
      conditions: "mild acidity",
      planningInputs: {
        primaryGoal: "weight loss",
      },
      activityLevel: {
        level: 3,
        multiplier: 1.55,
      },
    };

    const profile = buildHealthProfile(userProfile);

    expect(profile.metrics.bmi).toBe(22.1);
    expect(profile.metrics.bmrKcal).toBe(1287);
    expect(profile.metrics.tdeeKcal).toBe(1995);
    expect(profile.targets.calorieTargetKcal).toBe(1600);
    expect(profile.targets.proteinTargetGrams).toBe(93);
    expect(profile.riskConditions).toContain("digestive_issues");
  });

  test("detects obesity and diabetes risk flags", () => {
    const userProfile = {
      age: 46,
      gender: "male",
      heightCm: 165,
      weightKg: 94,
      conditions: "Type 2 diabetes and high blood pressure",
      planningInputs: {
        primaryGoal: "diabetes support",
      },
      activityLevel: {
        level: 2,
      },
    };

    const profile = buildHealthProfile(userProfile);

    expect(profile.metrics.bmiCategory).toBe("obese");
    expect(profile.riskConditions).toEqual(
      expect.arrayContaining(["obesity", "diabetes", "high_blood_pressure", "metabolic_risk"])
    );
  });
});
