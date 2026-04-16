const { buildProductionDietPlanningPrompt } = require("../llmPromptBuilder");

describe("llmPromptBuilder", () => {
  test("builds production prompt with required safety and schema rules", () => {
    const context = {
      calories: 1600,
      protein: 90,
      goal: "weight loss",
      conditions: {
        medical: ["diabetes"],
        allergies: ["peanut"],
      },
      preferences: {
        dominantDosha: "pitta",
      },
      schedule: {
        timings: {
          breakfastTime: "08:30",
        },
      },
    };

    const prompts = buildProductionDietPlanningPrompt(context);

    expect(prompts.systemPrompt).toContain("Certified Nutritionist");
    expect(prompts.systemPrompt).toContain("Ayurvedic Advisor");
    expect(prompts.systemPrompt).toContain("STRICTLY exclude any foods listed in allergies");
    expect(prompts.systemPrompt).toContain("Do not provide unsafe advice");
    expect(prompts.systemPrompt).toContain("\"summary\"");
    expect(prompts.systemPrompt).toContain("\"diet_plan\"");
    expect(prompts.systemPrompt).toContain("\"timing\"");
    expect(prompts.systemPrompt).toContain("\"notes\"");
    expect(prompts.userPrompt).toContain("\"calories\":1600");
    expect(prompts.userPrompt).toContain("\"protein\":90");
    expect(prompts.userPrompt).toContain("Do NOT hallucinate exact nutrient numbers per meal");
  });
});
