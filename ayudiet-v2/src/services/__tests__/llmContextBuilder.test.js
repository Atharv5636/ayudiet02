const { buildLlmContext } = require("../llmContextBuilder");

describe("llmContextBuilder", () => {
  test("builds structured LLM context with required keys", () => {
    const userProfile = {
      age: 29,
      gender: "female",
      bloodGroup: "B+",
      heightCm: 162,
      weightKg: 58,
      bmi: 22.1,
      conditions: "mild acidity, prediabetes",
      medications: "vitamin d weekly",
      allergies: "peanuts",
      dietType: "vegetarian",
      dominantDosha: "pitta",
      preferences: ["Quick meals", "Home-cooked food"],
      activityLevel: {
        level: 3,
        multiplier: 1.55,
      },
      planningInputs: {
        primaryGoal: "weight loss",
        targetWeightKg: 54,
        timeframeWeeks: 12,
        mealPattern: "3 meals + 1 snack",
        sleepHours: 7,
        stressLevel: 3,
        waterIntakeLiters: 2.3,
        mealTimings: {
          wakeUpTime: "06:30",
          breakfastTime: "08:30",
          lunchTime: "13:00",
          eveningSnackTime: "17:30",
          dinnerTime: "20:00",
          bedTime: "22:30",
        },
      },
    };

    const healthProfile = {
      metrics: {
        bmi: 22.1,
        bmiCategory: "normal",
        bmrKcal: 1287,
        tdeeKcal: 1995,
      },
      targets: {
        calorieTargetKcal: 1600,
        proteinTargetGrams: 93,
      },
      riskConditions: ["diabetes", "digestive_issues"],
      dataCompleteness: 100,
    };

    const context = buildLlmContext({ userProfile, healthProfile });

    expect(context).toEqual(
      expect.objectContaining({
        calories: 1600,
        protein: 93,
        goal: "weight loss",
        conditions: expect.any(Object),
        preferences: expect.any(Object),
        schedule: expect.any(Object),
      })
    );

    expect(context.conditions.riskFlags).toEqual(
      expect.arrayContaining(["diabetes", "digestive_issues"])
    );
    expect(context.conditions.medical).toEqual(
      expect.arrayContaining(["mild acidity", "prediabetes"])
    );
    expect(context.preferences.foods).toEqual(
      expect.arrayContaining(["Quick meals", "Home-cooked food"])
    );
    expect(context.schedule.timings.breakfastTime).toBe("08:30");
    expect(context.body.tdeeKcal).toBe(1995);
  });
});
