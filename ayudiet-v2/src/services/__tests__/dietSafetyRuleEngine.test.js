const {
  buildDietSafetyProfile,
  buildSafetyConstraintText,
  evaluateMealSafety,
  evaluateMealsSafety,
} = require("../dietSafetyRuleEngine");

describe("dietSafetyRuleEngine", () => {
  test("detects diabetes, high bp, overweight and allergies from profile", () => {
    const profile = buildDietSafetyProfile({
      patient: {
        healthConditions: "Type 2 diabetes, hypertension",
        allergies: "peanut, shellfish",
      },
      goal: "weight loss",
      healthProfile: {
        riskConditions: ["obesity"],
      },
    });

    expect(profile.diabetes).toBe(true);
    expect(profile.highBloodPressure).toBe(true);
    expect(profile.overweight).toBe(true);
    expect(profile.allergyTokens).toEqual(expect.arrayContaining(["peanut", "shellfish"]));
  });

  test("flags high sugar meals for diabetes", () => {
    const reasons = evaluateMealSafety("Mango sweet lassi with added sugar", {
      diabetes: true,
      highBloodPressure: false,
      allergyTokens: [],
    });
    expect(reasons).toContain("diabetes_high_sugar");
  });

  test("flags high salt meals for high bp", () => {
    const reasons = evaluateMealSafety("Poha with pickle and papad", {
      diabetes: false,
      highBloodPressure: true,
      allergyTokens: [],
    });
    expect(reasons).toContain("high_bp_high_salt");
  });

  test("flags allergens strictly", () => {
    const reasons = evaluateMealSafety("Peanut chutney with idli", {
      diabetes: false,
      highBloodPressure: false,
      allergyTokens: ["peanut"],
    });
    expect(reasons).toContain("allergy_peanut");
  });

  test("evaluates meal plan safety across days and slots", () => {
    const report = evaluateMealsSafety(
      [
        { day: "Day 1", breakfast: "Sweet corn flakes", lunch: "Dal rice", dinner: "Soup" },
        { day: "Day 2", breakfast: "Idli", lunch: "Poha with pickle", dinner: "Khichdi" },
      ],
      {
        diabetes: true,
        highBloodPressure: true,
        allergyTokens: [],
      }
    );

    expect(report.safe).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
  });

  test("builds reprompt safety constraints text", () => {
    const text = buildSafetyConstraintText({
      diabetes: true,
      highBloodPressure: true,
      overweight: true,
      allergyTokens: ["peanut"],
    });

    expect(text).toContain("Diabetes safety");
    expect(text).toContain("High BP safety");
    expect(text).toContain("STRICT");
    expect(text).toContain("calorie deficit");
  });
});
