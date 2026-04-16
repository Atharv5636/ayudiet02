const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const ApiError = require("../utils/ApiError");

const SLOT_KEYS = [
  "earlyMorning",
  "morning",
  "afterExercise",
  "breakfast",
  "midMorning",
  "lunch",
  "after2Hours",
  "evening",
  "lateEvening",
  "dinner",
  "bedTime",
];

const SLOT_LABELS_EN = {
  earlyMorning: "Early Morning",
  morning: "Morning",
  afterExercise: "After Exercise",
  breakfast: "Breakfast",
  midMorning: "Mid Morning",
  lunch: "Lunch",
  after2Hours: "After 2 Hrs",
  evening: "Evening",
  lateEvening: "Late Evening",
  dinner: "Dinner",
  bedTime: "Bed Time",
};

const SLOT_LABELS_MR = {
  earlyMorning: "लवकर सकाळी",
  morning: "सकाळ",
  afterExercise: "व्यायामानंतर",
  breakfast: "नाश्ता",
  midMorning: "मधली सकाळ",
  lunch: "दुपारचे जेवण",
  after2Hours: "२ तासांनी",
  evening: "संध्याकाळ",
  lateEvening: "उशिरा संध्याकाळी",
  dinner: "रात्रीचे जेवण",
  bedTime: "झोपण्यापूर्वी",
};

const HEADER_LABELS = {
  en: {
    mobile: "Mob.",
    planTitle: "Diet Plan",
    patient: "Patient",
    goal: "Goal",
    doctor: "Doctor",
    age: "Age",
    dosha: "Dosha",
    date: "Date",
    day: "Day",
  },
  mr: {
    mobile: "मो.",
    planTitle: "आहार योजना",
    patient: "रुग्णाचे नाव",
    goal: "ध्येय",
    doctor: "डॉक्टर",
    age: "वय",
    dosha: "दोष",
    date: "दिनांक",
    day: "दिवस",
  },
};

const REGION_TO_LANG = {
  maharashtra: "mr",
  gujarat: "gu",
  punjab: "pa",
  rajasthan: "hi",
  uttar_pradesh: "hi",
  bihar: "hi",
  west_bengal: "bn",
  odisha: "or",
  karnataka: "kn",
  tamil_nadu: "ta",
  kerala: "ml",
  andhra_pradesh: "te",
  telangana: "te",
  assam: "as",
  pan_india: "hi",
};

const FONT_FILE_BY_LANG = {
  en: null,
  hi: "NotoSansDevanagari-Regular.ttf",
  mr: "NotoSansDevanagari-Regular.ttf",
  gu: "NotoSansGujarati-Regular.ttf",
  pa: "NotoSansGurmukhi-Regular.ttf",
  bn: "NotoSansBengali-Regular.ttf",
  as: "NotoSansBengali-Regular.ttf",
  or: "NotoSansOriya-Regular.ttf",
  kn: "NotoSansKannada-Regular.ttf",
  ta: "NotoSansTamil-Regular.ttf",
  ml: "NotoSansMalayalam-Regular.ttf",
  te: "NotoSansTelugu-Regular.ttf",
};

const CLEAN_PHRASE_MAP = {
  mr: [
    ["Warm water with a pinch of cumin and ginger", "जिरे आणि आलं घातलेलं कोमट पाणी"],
    ["5 soaked almonds", "५ भिजवलेले बदाम"],
    ["Almond milk protein shake with banana and cinnamon", "केळी आणि दालचिनी घातलेला बदाम दुधाचा प्रोटीन शेक"],
    ["Fruit-curd bowl with pumpkin seeds", "भोपळ्याच्या बिया घातलेला फळ-दही बाउल"],
    ["Mint tea and 4 pistachios", "पुदिना चहा आणि ४ पिस्ते"],
    ["Rajma rice bowl with mixed salad", "मिक्स सॅलडसह राजमा-भात बाउल"],
    ["Cucumber slices with a squeeze of lemon", "लिंबू पिळलेल्या काकडीच्या फोडी"],
    ["Amla juice diluted with water", "पाण्यात मिसळलेला आवळा ज्यूस"],
    ["Turmeric almond milk (golden milk)", "हळदीचे बदाम दूध (गोल्डन मिल्क)"],
    ["Paneer and vegetable nourish bowl", "पनीर आणि भाज्यांचा पौष्टिक बाउल"],
    ["Chamomile tea", "कॅमोमाइल चहा"],
    ["Paneer breakfast wrap", "पनीर नाश्ता रॅप"],
    ["Cilantro lime water", "कोथिंबीर-लिंबू पाणी"],
    ["Chapati with lauki sabzi and moong dal", "चपातीसोबत दुधी भोपळ्याची भाजी आणि मूग डाळ"],
    ["Roasted pumpkin seeds", "भाजलेल्या भोपळ्याच्या बिया"],
    ["Roasted pumpkin seeds (small handful)", "भाजलेल्या भोपळ्याच्या बिया (छोटी मूठभर)"],
    ["Coconut yogurt with honey", "मधासह नारळाचे दही"],
    ["Saffron almond milk", "केशर बदाम दूध"],
    ["Vegetable stew with small red-rice serving", "भाज्यांचा स्ट्यू आणि लाल तांदळाचा छोटा भाग"],
    ["Tulsi (holy basil) tea", "तुळशीचा चहा"],
    ["Coconut water with a pinch of rock salt", "सेंधव मिठाची चिमूट घातलेले नारळ पाणी"],
    ["Soy protein shake with mango and cardamom", "आंबा आणि वेलचीसह सोया प्रोटीन शेक"],
    ["Steamed carrot sticks", "वाफवलेल्या गाजराच्या काड्या"],
    ["Fresh papaya cubes", "ताज्या पपईचे तुकडे"],
    ["Licorice tea", "जेष्ठमध चहा"],
    ["Vegetable daliya with lentils", "भाजी दळिया आणि डाळी"],
  ],
hi: [
    ["Warm water with a pinch of cumin and ginger", "à¤œà¥€à¤°à¤¾ à¤”à¤° à¤…à¤¦à¤°à¤• à¤µà¤¾à¤²à¤¾ à¤—à¥à¤¨à¤—à¥à¤¨à¤¾ à¤ªà¤¾à¤¨à¥€"],
    ["5 soaked almonds", "5 à¤­à¥€à¤—à¥‡ à¤¹à¥à¤ à¤¬à¤¾à¤¦à¤¾à¤®"],
    ["Almond milk protein shake with banana and cinnamon", "à¤•à¥‡à¤²à¤¾ à¤”à¤° à¤¦à¤¾à¤²à¤šà¥€à¤¨à¥€ à¤µà¤¾à¤²à¤¾ à¤¬à¤¾à¤¦à¤¾à¤® à¤¦à¥‚à¤§ à¤ªà¥à¤°à¥‹à¤Ÿà¥€à¤¨ à¤¶à¥‡à¤•"],
  ],
};

const WORD_REPLACEMENTS = {
  mr: [
    ["warm", "गरम"],
    ["lukewarm", "कोमट"],
    ["water", "पाणी"],
    ["glass", "ग्लास"],
    ["cup", "कप"],
    ["tea", "चहा"],
    ["coffee", "कॉफी"],
    ["milk", "दूध"],
    ["buttermilk", "ताक"],
    ["fruit", "फळ"],
    ["salad", "सॅलड"],
    ["bowl", "बाउल"],
    ["soup", "सूप"],
    ["khichdi", "खिचडी"],
    ["upma", "उपमा"],
    ["poha", "पोहे"],
    ["curd", "दही"],
    ["rice", "भात"],
    ["dal", "डाळ"],
    ["roti", "पोळी"],
    ["chapati", "चपाती"],
    ["paneer", "पनीर"],
    ["tofu", "टोफू"],
    ["sprouts", "मोड आलेले कडधान्य"],
    ["mixed", "मिक्स"],
    ["vegetable", "भाजी"],
    ["vegetables", "भाज्या"],
    ["mint", "पुदिना"],
    ["cucumber", "काकडी"],
    ["lemon", "लिंबू"],
    ["ginger", "आलं"],
    ["cumin", "जिरे"],
    ["almonds", "बदाम"],
    ["almond", "बदाम"],
    ["banana", "केळी"],
    ["turmeric", "हळद"],
    ["protein", "प्रोटीन"],
    ["shake", "शेक"],
    ["seeds", "बिया"],
    ["with", "सह"],
    ["and", "आणि"],
    ["or", "किंवा"],
    ["coriander", "कोथिंबीर"],
    ["walnuts", "अक्रोड"],
    ["walnut", "अक्रोड"],
    ["soy", "सोया"],
    ["mango", "आंबा"],
    ["cardamom", "वेलची"],
    ["coconut", "नारळ"],
    ["pinch", "चिमूट"],
    ["salt", "मीठ"],
    ["papaya", "पपई"],
    ["apple", "सफरचंद"],
    ["guava", "पेरू"],
    ["diluted", "मिसळलेला"],
    ["juice", "ज्यूस"],
    ["lauki", "दुधी भोपळा"],
    ["sabzi", "भाजी"],
    ["moong", "मूग"],
    ["yogurt", "दही"],
    ["honey", "मध"],
    ["roasted", "भाजलेले"],
    ["pumpkin", "भोपळा"],
    ["small", "छोटा"],
    ["handful", "मूठभर"],
    ["tulsi", "तुळस"],
    ["holy basil", "तुळस"],
    ["stew", "स्ट्यू"],
    ["serving", "भाग"],
    ["red-rice", "लाल तांदूळ"],
    ["red rice", "लाल तांदूळ"],
    ["wrap", "रॅप"],
  ],
hi: [
    ["warm", "à¤—à¤°à¤®"],
    ["lukewarm", "à¤—à¥à¤¨à¤—à¥à¤¨à¤¾"],
    ["water", "à¤ªà¤¾à¤¨à¥€"],
    ["glass", "à¤—à¤¿à¤²à¤¾à¤¸"],
    ["cup", "à¤•à¤ª"],
    ["tea", "à¤šà¤¾à¤¯"],
    ["coffee", "à¤•à¥‰à¤«à¥€"],
    ["milk", "à¤¦à¥‚à¤§"],
    ["fruit", "à¤«à¤²"],
    ["salad", "à¤¸à¤²à¤¾à¤¦"],
    ["soup", "à¤¸à¥‚à¤ª"],
    ["dal", "à¤¦à¤¾à¤²"],
    ["roti", "à¤°à¥‹à¤Ÿà¥€"],
    ["paneer", "à¤ªà¤¨à¥€à¤°"],
    ["tofu", "à¤Ÿà¥‹à¤«à¥‚"],
    ["vegetable", "à¤¸à¤¬à¥à¤œà¥€"],
    ["vegetables", "à¤¸à¤¬à¥à¤œà¤¿à¤¯à¤¾à¤‚"],
  ],
};

const TRANSLATION_PREFIX = {
  mr: "भाषांतर:",
  hi: "अनुवाद:",
  gu: "અનુવાદ:",
  pa: "ਅਨੁਵਾਦ:",
  bn: "অনুবাদ:",
  or: "ଅନୁବାଦ:",
  kn: "ಅನುವಾದ:",
  ta: "மொழிபெயர்ப்பு:",
  ml: "പരിഭാഷ:",
  te: "అనువాదం:",
  as: "অনুবাদ:",
};

const normalizeText = (value = "") =>
  String(value || "")
    .split("|")[0]
    .replace(/\s+/g, " ")
    .trim();

const maybeDecodeMojibake = (value = "") => {
  const raw = String(value || "");
  if (!raw) return raw;
  if (/[\u0900-\u0D7F]/.test(raw)) return raw;
  // Detect common mojibake markers (UTF-8 text interpreted as latin1/windows-1252).
  if (!/[ÃÂà]/.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, "latin1").toString("utf8");
    // Accept decode only when it actually becomes Indic script text.
    if (/[\u0900-\u0D7F]/.test(decoded)) return decoded;
    return raw;
  } catch {
    return raw;
  }
};

const resolveRegionalLanguage = ({ requested, patientRegion }) => {
  const normalizedRequested = String(requested || "").trim().toLowerCase();
  if (normalizedRequested && normalizedRequested !== "auto") return normalizedRequested;
  const region = String(patientRegion || "").trim().toLowerCase();
  return REGION_TO_LANG[region] || "hi";
};

const buildSlotPlans = (patient = {}) => {
  const existing = Array.isArray(patient?.slotPlans) ? patient.slotPlans : [];
  if (existing.length) return existing;

  const meals = Array.isArray(patient?.plan) ? patient.plan : [];
  return meals.map((day = {}) => ({
    earlyMorning: "Warm water with a pinch of cumin and ginger",
    morning: "5 soaked almonds",
    afterExercise: "Almond milk protein shake with banana and cinnamon",
    breakfast: normalizeText(day?.breakfast),
    midMorning: "Mint tea and 4 pistachios",
    lunch: normalizeText(day?.lunch),
    after2Hours: "Cucumber slices with a squeeze of lemon",
    evening: "Amla juice diluted with water",
    lateEvening: "Turmeric almond milk (golden milk)",
    dinner: normalizeText(day?.dinner),
    bedTime: "Chamomile tea",
  }));
};

const translateMealLine = (line = "", language = "en") => {
  const input = String(line || "").trim();
  if (!input || language === "en") return input;

  const map = CLEAN_PHRASE_MAP[language] || [];
  const wordPairs = WORD_REPLACEMENTS[language] || [];
  const escapeRegExp = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let output = input;

  map.forEach(([from, to]) => {
    const decodedTo = maybeDecodeMojibake(to);
    const pattern = new RegExp(escapeRegExp(from).replace(/\s+/g, "\\s+"), "gi");
    output = output.replace(pattern, decodedTo);
  });

  wordPairs.forEach(([from, to]) => {
    const escaped = escapeRegExp(from);
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    output = output.replace(pattern, maybeDecodeMojibake(to));
  });

  // Keep output clean but do not aggressively strip English words,
  // otherwise rows can become unreadable when a phrase is not mapped yet.
  output = output
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\{\s*\}/g, "")
    .replace(/\s+[,:;/-]\s*$/g, "")
    .replace(/^[,:;/-]\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();

  const scriptCharCount = (output.match(/[\u0900-\u0D7F]/g) || []).length;
  const inputWordCount = (input.match(/[A-Za-z]+/g) || []).length;
  if (!output) return input;
  if (inputWordCount >= 3 && scriptCharCount < 4) return input;
  if (output === input) return input;

  return output;
};
const registerPdfFonts = (doc, languages = []) => {
  const uniqueLanguages = [...new Set((languages || []).filter(Boolean))];
  const fontsRoot = path.resolve(__dirname, "../assets/fonts");
  const loaded = {};

  uniqueLanguages.forEach((lang) => {
    const file = FONT_FILE_BY_LANG[lang];
    if (!file) return;
    const fullPath = path.join(fontsRoot, file);
    if (fs.existsSync(fullPath)) {
      const name = `font_${lang}`;
      doc.registerFont(name, fullPath);
      loaded[lang] = name;
    }
  });

  return loaded;
};

const safeFont = (loadedFonts = {}, lang = "en") => loadedFonts[lang] || "Helvetica";
const safeAscii = (value = "") => String(value || "").replace(/[^\x20-\x7E]/g, "");
const hasIndicScript = (value = "") => /[\u0900-\u0D7F]/.test(String(value || ""));
const pickFontForText = (preferredFont = "Helvetica", text = "") =>
  hasIndicScript(text) ? preferredFont : "Helvetica";
const safePdfText = (doc, fontName, fontSize, text, xPos, yPos, options = {}) => {
  const chosenFont = pickFontForText(fontName, text);
  try {
    doc.font(chosenFont).fontSize(fontSize).text(text, xPos, yPos, options);
  } catch {
    doc.font("Helvetica").fontSize(fontSize).text(safeAscii(text) || "-", xPos, yPos, options);
  }
};

const drawRow = ({
  doc,
  y,
  pageWidth,
  label,
  primaryText,
  secondaryText,
  primaryFont,
  secondaryFont,
}) => {
  const x = doc.page.margins.left;
  const totalWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
  const slotW = Math.round(totalWidth * 0.32);
  const colonW = Math.round(totalWidth * 0.04);
  const mealW = totalWidth - slotW - colonW;

  const mealX = x + slotW + colonW;
  const safeMeasure = (fontName, fontSize, text, width) => {
    const chosenFont = pickFontForText(fontName, text);
    try {
      return doc.font(chosenFont).fontSize(fontSize).heightOfString(text || "-", { width });
    } catch {
      return doc.font("Helvetica").fontSize(fontSize).heightOfString(safeAscii(text || "-") || "-", { width });
    }
  };
  const safeText = (fontName, fontSize, text, xPos, yPos, options = {}) => {
    const chosenFont = pickFontForText(fontName, text);
    try {
      doc.font(chosenFont).fontSize(fontSize).text(text, xPos, yPos, options);
    } catch {
      doc.font("Helvetica").fontSize(fontSize).text(safeAscii(text) || "-", xPos, yPos, options);
    }
  };

  const englishHeight = safeMeasure(primaryFont, 10, primaryText || "-", mealW - 10);
  const regionalHeight = secondaryText
    ? safeMeasure(secondaryFont, 9, secondaryText, mealW - 10)
    : 0;
  const rowH = Math.max(28, Math.ceil(englishHeight + regionalHeight + (secondaryText ? 12 : 8)));

  doc.rect(x, y, slotW, rowH).stroke("#999");
  doc.rect(x + slotW, y, colonW, rowH).stroke("#999");
  doc.rect(mealX, y, mealW, rowH).stroke("#999");

  doc.fillColor("#111");
  safeText(primaryFont, 10, label, x + 6, y + 8, {
    width: slotW - 12,
    align: "left",
  });
  safeText(primaryFont, 11, ":", x + slotW + 4, y + 8, {
    width: colonW - 8,
    align: "center",
  });
  safeText(primaryFont, 10, primaryText || "-", mealX + 6, y + 6, {
    width: mealW - 12,
    align: "left",
  });
  if (secondaryText) {
    const y2 = y + 6 + englishHeight + 4;
    doc.fillColor("#444");
    safeText(secondaryFont, 9, secondaryText, mealX + 6, y2, {
      width: mealW - 12,
      align: "left",
    });
  }
  doc.fillColor("#111");
  return rowH;
};

const drawHeader = ({ doc, patient, primaryFont, primaryLanguage = "en" }) => {
  const labels = HEADER_LABELS[primaryLanguage] || HEADER_LABELS.en;
  const clinicTitle =
    primaryLanguage === "mr" ? "राईट हेल्थ" : patient?.clinicName || "RIGHT HEALTH";
  const planTitleText =
    primaryLanguage === "mr" ? labels.planTitle : patient?.planTitle || labels.planTitle;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  safePdfText(doc, primaryFont, 16, clinicTitle, left, 28, {
    width: 260,
  });
  safePdfText(
    doc,
    primaryFont,
    10,
    patient?.clinicMobile ? `${labels.mobile} ${patient.clinicMobile}` : "",
    right - 160,
    32,
    { width: 160, align: "right" }
  );
  doc.moveTo(left, 48).lineTo(right, 48).stroke("#111");

  safePdfText(doc, primaryFont, 14, planTitleText, left, 56, {
    width: right - left,
    align: "center",
  });

  doc.rect(left, 78, right - left, 44).stroke("#111");
  const leftLabelX = left + 8;
  const leftValueX = left + 86;
  const rightLabelX = right - 220;
  const rightValueX = right - 8;

  safePdfText(doc, primaryFont, 10, `${labels.patient}:`, leftLabelX, 84);
  safePdfText(doc, primaryFont, 10, `${patient?.name || "N/A"}`, leftValueX, 84);
  safePdfText(doc, primaryFont, 10, `${labels.goal}:`, leftLabelX, 98);
  safePdfText(doc, primaryFont, 10, `${patient?.goal || "General Wellness"}`, leftValueX, 98);
  safePdfText(doc, primaryFont, 10, `${labels.doctor}:`, leftLabelX, 112);
  safePdfText(doc, primaryFont, 10, `${patient?.doctorName || "Doctor"}`, leftValueX, 112);

  safePdfText(doc, primaryFont, 10, `${labels.age}:`, rightLabelX, 84, { width: 80, align: "right" });
  safePdfText(doc, primaryFont, 10, `${patient?.age ?? "N/A"}`, rightValueX - 90, 84, {
    width: 90,
    align: "right",
  });
  safePdfText(doc, primaryFont, 10, `${labels.dosha}:`, rightLabelX, 98, { width: 80, align: "right" });
  safePdfText(doc, primaryFont, 10, `${patient?.doshaType || "N/A"}`, rightValueX - 90, 98, {
    width: 90,
    align: "right",
  });
  safePdfText(doc, primaryFont, 10, `${labels.date}:`, rightLabelX, 112, { width: 80, align: "right" });
  safePdfText(doc, primaryFont, 10, `${new Date().toLocaleDateString("en-GB")}`, rightValueX - 90, 112, {
    width: 90,
    align: "right",
  });

  return 130;
};

const generatePlanPdf = async (req, res, next) => {
  try {
    const patient = req.body?.patient;
    const pdfMode = "english_only";
    const requestedRegionalLanguage = "auto";

    if (!patient || typeof patient !== "object") {
      return next(new ApiError(400, "patient payload is required"));
    }

    const regionalLanguage = resolveRegionalLanguage({
      requested: requestedRegionalLanguage,
      patientRegion: patient?.localRegion || patient?.planningInputs?.localRegion,
    });
    const isBilingual = false;
    const isRegionalOnly = false;

    const primaryLanguage = "en";
    const secondaryLanguage = "";

    const doc = new PDFDocument({
      size: "A4",
      margin: 28,
      bufferPages: false,
      autoFirstPage: true,
    });

    const fonts = registerPdfFonts(doc, [primaryLanguage, secondaryLanguage]);
    const primaryFont = safeFont(fonts, primaryLanguage);
    const secondaryFont = safeFont(fonts, secondaryLanguage || primaryLanguage);

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", (error) => next(error));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const safeName = String(patient?.name || "diet-plan").replace(/[^\w\s-]/g, "").trim() || "diet-plan";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=\"${safeName}-diet-plan.pdf\"`);
      res.send(pdfBuffer);
    });

    const pageWidth = doc.page.width;
    let y = drawHeader({ doc, patient, primaryFont, primaryLanguage });

    const slotPlans = buildSlotPlans(patient);
    const dayPlan = Array.isArray(patient?.plan) ? patient.plan : [];

    dayPlan.forEach((day, dayIndex) => {
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = drawHeader({ doc, patient, primaryFont, primaryLanguage });
      }

      const left = doc.page.margins.left;
      const usableWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
      doc.rect(left, y, usableWidth, 24).fillAndStroke("#f3f3f3", "#111");
      const dayPrefix =
        primaryLanguage === "mr" ? HEADER_LABELS.mr.day : HEADER_LABELS.en.day;
      doc.fillColor("#111");
      safePdfText(doc, primaryFont, 13, day?.day || `${dayPrefix} ${dayIndex + 1}`, left, y + 5, {
        width: usableWidth,
        align: "center",
      });
      y += 24;

      const daySlotPlan = slotPlans[dayIndex] || {};
      SLOT_KEYS.forEach((slotKey) => {
        const sourceText = normalizeText(daySlotPlan?.[slotKey] || "");
        const primaryMeal = translateMealLine(sourceText || "-", primaryLanguage);
        const regionalMeal =
          secondaryLanguage && secondaryLanguage !== primaryLanguage
            ? translateMealLine(sourceText || "-", secondaryLanguage)
            : "";
        const showRegionalLine =
          Boolean(regionalMeal) && regionalMeal !== primaryMeal;

        if (y > doc.page.height - 100) {
          doc.addPage();
          y = drawHeader({ doc, patient, primaryFont, primaryLanguage });
        }

        const labelMap = primaryLanguage === "mr" ? SLOT_LABELS_MR : SLOT_LABELS_EN;
        const rowHeight = drawRow({
          doc,
          y,
          pageWidth,
          label: labelMap[slotKey] || slotKey,
          primaryText: primaryMeal,
          secondaryText: showRegionalLine ? regionalMeal : "",
          primaryFont,
          secondaryFont,
        });
        y += rowHeight;
      });

      y += 10;
    });

    doc.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generatePlanPdf,
};




