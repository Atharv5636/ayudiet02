import { Document, Font, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  getPdfDictionary,
  getPdfFontFamily,
  translateMealLine,
} from "@/utils/pdfI18n";

const registerFont = (family, src) => {
  try {
    // Use a single-font registration for maximum compatibility with react-pdf.
    Font.register({ family, src });
    return true;
  } catch (error) {
    // Keep rendering resilient, but log once so font failures are diagnosable.
    console.warn(`Failed to register PDF font '${family}' from '${src}'`, error);
    return false;
  }
};

const getFontUrl = (filename) => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(`/fonts/${filename}`, window.location.origin).toString();
  }
  const basePath = import.meta.env.BASE_URL || "/";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}fonts/${filename}`;
};

const FONT_FILE_BY_FAMILY = {
  NotoSansDevanagari: "NotoSansDevanagari-Regular.ttf",
  NotoSansGujarati: "NotoSansGujarati-Regular.ttf",
  NotoSansGurmukhi: "NotoSansGurmukhi-Regular.ttf",
  NotoSansBengali: "NotoSansBengali-Regular.ttf",
  NotoSansOriya: "NotoSansOriya-Regular.ttf",
  NotoSansKannada: "NotoSansKannada-Regular.ttf",
  NotoSansTamil: "NotoSansTamil-Regular.ttf",
  NotoSansMalayalam: "NotoSansMalayalam-Regular.ttf",
  NotoSansTelugu: "NotoSansTelugu-Regular.ttf",
};

const registeredFontFamilies = new Set();
const loadedFontFamilies = new Set();
const fontLoadPromises = new Map();

const ensureFontRegisteredForLanguage = (languageCode = "en") => {
  const family = getPdfFontFamily(languageCode);
  if (!family || family === "Helvetica") return true;
  if (loadedFontFamilies.has(family) || registeredFontFamilies.has(family)) return true;
  const filename = FONT_FILE_BY_FAMILY[family];
  if (!filename) return false;
  const ok = registerFont(family, getFontUrl(filename));
  if (ok) {
    registeredFontFamilies.add(family);
    return true;
  }
  return false;
};

const ensureFontLoadedForLanguage = async (languageCode = "en") => {
  const family = getPdfFontFamily(languageCode);
  if (!family || family === "Helvetica") return true;
  if (loadedFontFamilies.has(family)) return true;
  if (fontLoadPromises.has(family)) return fontLoadPromises.get(family);

  const filename = FONT_FILE_BY_FAMILY[family];
  if (!filename) return false;

  const promise = (async () => {
    try {
      const fontUrl = getFontUrl(filename);
      const response = await fetch(fontUrl, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Font fetch failed with ${response.status} for ${fontUrl}`);
      }
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // TrueType starts with 00 01 00 00; OpenType starts with "OTTO".
      const isTtf =
        bytes.length > 4 &&
        bytes[0] === 0x00 &&
        bytes[1] === 0x01 &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x00;
      const isOtf =
        bytes.length > 4 &&
        bytes[0] === 0x4f &&
        bytes[1] === 0x54 &&
        bytes[2] === 0x54 &&
        bytes[3] === 0x4f;
      if (!isTtf && !isOtf) {
        throw new Error(`Fetched file is not a valid font binary for ${family}`);
      }
      const objectUrl = URL.createObjectURL(blob);
      const ok = registerFont(family, objectUrl);
      if (!ok) return false;
      loadedFontFamilies.add(family);
      registeredFontFamilies.add(family);
      return true;
    } catch (error) {
      console.warn(`Unable to preload PDF font '${family}'`, error);
      return false;
    }
  })();

  fontLoadPromises.set(family, promise);
  return promise;
};

export const preloadPdfFontsForLanguages = async (languageCodes = []) => {
  const uniqueCodes = [...new Set((languageCodes || []).filter(Boolean))];
  if (!uniqueCodes.length) return true;
  const results = await Promise.all(uniqueCodes.map((code) => ensureFontLoadedForLanguage(code)));
  return results.every(Boolean);
};

const SLOT_ROW_KEYS = [
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

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 24,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  brand: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  mobile: {
    fontSize: 10,
    fontWeight: 700,
  },
  divider: {
    borderBottomWidth: 1.2,
    borderBottomColor: "#111111",
    marginBottom: 10,
  },
  chartTitle: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 3,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  subtitle: {
    textAlign: "center",
    fontSize: 9.5,
    marginBottom: 10,
  },
  patientStrip: {
    borderWidth: 1,
    borderColor: "#111111",
    paddingVertical: 5,
    paddingHorizontal: 7,
    marginBottom: 10,
  },
  patientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  patientText: {
    fontSize: 9.5,
  },
  dayCard: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#111111",
  },
  dayHeader: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    paddingTop: 5,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    backgroundColor: "#f3f3f3",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#c7c7c7",
    minHeight: 34,
  },
  slotCell: {
    width: "32%",
    borderRightWidth: 1,
    borderRightColor: "#c7c7c7",
    paddingVertical: 5,
    paddingHorizontal: 6,
    justifyContent: "flex-start",
  },
  colonCell: {
    width: "4%",
    borderRightWidth: 1,
    borderRightColor: "#c7c7c7",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  mealCell: {
    width: "64%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  slotText: {
    fontSize: 9.5,
    fontWeight: 600,
  },
  mealText: {
    fontSize: 9.5,
    lineHeight: 12.5,
  },
  secondaryMealText: {
    fontSize: 9,
    lineHeight: 11.5,
    color: "#4b5563",
    marginTop: 2,
  },
  noteBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#111111",
    paddingVertical: 6,
    paddingHorizontal: 7,
  },
  noteTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    marginBottom: 4,
  },
  noteItem: {
    fontSize: 9,
    lineHeight: 12,
    marginBottom: 2,
  },
});

const cleanMeal = (value = "") =>
  String(value || "")
    .split("|")[0]
    .replace(/\s+/g, " ")
    .trim();

const toArray = (value) => (Array.isArray(value) ? value : []);

const buildSlotPlanForDay = (day = {}, options = {}) => {
  const breakfast = cleanMeal(day?.breakfast);
  const lunch = cleanMeal(day?.lunch);
  const dinner = cleanMeal(day?.dinner);
  const includeExercise = options?.includeExercise !== false;

  return {
    earlyMorning: "1 glass lukewarm water",
    morning: "1 cup tea / black coffee",
    afterExercise: includeExercise
      ? "200 ml toned milk or 1 fruit"
      : "Light hydration",
    breakfast: breakfast || "-",
    midMorning: breakfast ? "1 fruit or coconut water" : "-",
    lunch: lunch || "-",
    after2Hours: "1 glass buttermilk / coconut water",
    evening: "1 cup tea/coffee + light snack",
    lateEvening: "1 fruit / salad",
    dinner: dinner || "-",
    bedTime: "1 cup warm milk",
  };
};

const normalizeSlotPlan = (slotPlan = {}, day = {}, language = "en") => {
  const fallback = buildSlotPlanForDay(day, { includeExercise: true });
  const normalized = { ...fallback };
  SLOT_ROW_KEYS.forEach((slotKey) => {
    const value = String(slotPlan?.[slotKey] || "").trim();
    if (value) normalized[slotKey] = value;
  });
  SLOT_ROW_KEYS.forEach((slotKey) => {
    normalized[slotKey] = translateMealLine(normalized[slotKey], language);
  });
  return normalized;
};

const getSlotRows = (language = "en") => {
  const dict = getPdfDictionary(language);
  return SLOT_ROW_KEYS.map((key) => ({
    key,
    label: dict?.slots?.[key] || key,
  }));
};

const formatDateLabel = (value) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

export default function DietPlanPDF({
  patient,
  language = "en",
  secondaryLanguage = "",
}) {
  const primaryFontReady = ensureFontRegisteredForLanguage(language);
  const secondaryFontReady = secondaryLanguage
    ? ensureFontRegisteredForLanguage(secondaryLanguage)
    : false;

  const dict = getPdfDictionary(language);
  const secondaryDict = getPdfDictionary(secondaryLanguage || language);
  const requestedPrimaryFontFamily = primaryFontReady
    ? getPdfFontFamily(language)
    : "Helvetica";
  const requestedSecondaryFontFamily =
    secondaryLanguage && secondaryFontReady
      ? getPdfFontFamily(secondaryLanguage)
      : requestedPrimaryFontFamily;
  const hasSecondaryLanguage =
    Boolean(secondaryLanguage) && secondaryLanguage !== language && secondaryFontReady;
  if (secondaryLanguage && secondaryLanguage !== language && !secondaryFontReady) {
    throw new Error(`Regional font unavailable for language '${secondaryLanguage}'`);
  }
  if (language !== "en" && !primaryFontReady) {
    throw new Error(`Primary font unavailable for language '${language}'`);
  }
  // Keep one font family across the whole document in bilingual mode to avoid
  // mixed-font text layout crashes in the PDF renderer.
  const unifiedBilingualFontFamily = hasSecondaryLanguage
    ? requestedSecondaryFontFamily
    : requestedPrimaryFontFamily;
  const primaryFontFamily = unifiedBilingualFontFamily;
  const secondaryFontFamily = unifiedBilingualFontFamily;
  const slotRows = getSlotRows(language);
  const safePatient = {
    name: patient?.name || "N/A",
    age: patient?.age ?? "N/A",
    goal: patient?.goal || "General Wellness",
    doshaType: patient?.doshaType || "N/A",
    planTitle: patient?.planTitle || "Diet Plan",
    doctorName: patient?.doctorName || "Doctor",
    clinicName: patient?.clinicName || "RIGHT HEALTH",
    clinicMobile: patient?.clinicMobile || "",
    date: patient?.date || new Date().toISOString(),
    plan: toArray(patient?.plan),
    slotPlans: toArray(patient?.slotPlans),
  };

  const dayChunks = [];
  for (let index = 0; index < safePatient.plan.length; index += 2) {
    dayChunks.push(safePatient.plan.slice(index, index + 2));
  }
  if (!dayChunks.length) {
    dayChunks.push([]);
  }

  return (
    <Document>
      {dayChunks.map((chunk, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
          <View style={styles.topRow}>
            <Text style={[styles.brand, { fontFamily: primaryFontFamily }]}>
              {safePatient.clinicName}
            </Text>
            <Text style={[styles.mobile, { fontFamily: primaryFontFamily }]}>
              {safePatient.clinicMobile ? `Mob. ${safePatient.clinicMobile}` : ""}
            </Text>
          </View>
          <View style={styles.divider} />

          <Text style={[styles.chartTitle, { fontFamily: primaryFontFamily }]}>
            {safePatient.planTitle}
          </Text>
          <Text style={[styles.subtitle, { fontFamily: primaryFontFamily }]}>
            {dict.personalizedDietChart}
          </Text>

          {pageIndex === 0 ? (
            <View style={styles.patientStrip}>
              <View style={styles.patientRow}>
                <Text style={[styles.patientText, { fontFamily: primaryFontFamily }]}>
                  {dict.patient}: {safePatient.name}
                </Text>
                <Text style={[styles.patientText, { fontFamily: primaryFontFamily }]}>
                  {dict.age}: {safePatient.age}
                </Text>
              </View>
              <View style={styles.patientRow}>
                <Text style={[styles.patientText, { fontFamily: primaryFontFamily }]}>
                  {dict.goal}: {safePatient.goal}
                </Text>
                <Text style={[styles.patientText, { fontFamily: primaryFontFamily }]}>
                  {dict.dosha}: {safePatient.doshaType}
                </Text>
              </View>
              <View style={styles.patientRow}>
                <Text style={[styles.patientText, { fontFamily: primaryFontFamily }]}>
                  {dict.doctor}: {safePatient.doctorName}
                </Text>
                <Text style={[styles.patientText, { fontFamily: primaryFontFamily }]}>
                  {dict.date}: {formatDateLabel(safePatient.date)}
                </Text>
              </View>
            </View>
          ) : null}

          {chunk.length > 0 ? (
            chunk.map((day, dayOffset) => {
              const dayNumber = pageIndex * 2 + dayOffset + 1;
              const flatDayIndex = pageIndex * 2 + dayOffset;
              const slotPlan = normalizeSlotPlan(safePatient.slotPlans[flatDayIndex], day, language);

              return (
                <View key={`day-${pageIndex}-${dayOffset}`} style={styles.dayCard}>
                  <Text style={[styles.dayHeader, { fontFamily: primaryFontFamily }]}>
                    {day?.day?.trim() || `Day - ${dayNumber}`}
                  </Text>

                  {slotRows.map((slot, slotIndex) => {
                    const primaryMeal = slotPlan[slot.key] || "-";
                    const secondaryMeal = hasSecondaryLanguage
                      ? translateMealLine(primaryMeal, secondaryLanguage)
                      : "";
                    const secondaryMealText =
                      hasSecondaryLanguage && secondaryMeal && secondaryMeal !== primaryMeal
                        ? secondaryMeal
                        : "";
                    const showSecondaryMeal = hasSecondaryLanguage && Boolean(secondaryMealText);
                    const slotLabelText = hasSecondaryLanguage
                      ? `${slot.label} (${secondaryDict?.slots?.[slot.key] || slot.label})`
                      : slot.label;

                    return (
                      <View
                        key={`row-${pageIndex}-${dayOffset}-${slot.key}`}
                        style={[
                          styles.tableRow,
                          slotIndex === slotRows.length - 1 ? { borderBottomWidth: 0 } : null,
                        ]}
                      >
                        <View style={styles.slotCell}>
                          <Text style={[styles.slotText, { fontFamily: primaryFontFamily }]}>
                            {slotLabelText}
                          </Text>
                        </View>
                        <View style={styles.colonCell}>
                          <Text style={[styles.slotText, { fontFamily: primaryFontFamily }]}>
                            :
                          </Text>
                        </View>
                        <View style={styles.mealCell}>
                          <Text style={[styles.mealText, { fontFamily: primaryFontFamily }]}>
                            {primaryMeal}
                          </Text>
                          {showSecondaryMeal ? (
                            <Text
                              style={[
                                styles.secondaryMealText,
                                { fontFamily: secondaryFontFamily },
                              ]}
                            >
                              {secondaryMealText}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })
          ) : (
            <View style={styles.dayCard}>
              <Text style={[styles.dayHeader, { fontFamily: primaryFontFamily }]}>
                {dict.noDayData}
              </Text>
              <View style={{ padding: 8 }}>
                <Text style={[styles.mealText, { fontFamily: primaryFontFamily }]}>
                  {dict.noDietPlanAvailable}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.noteBox}>
            <Text style={[styles.noteTitle, { fontFamily: primaryFontFamily }]}>
              {dict.note}:
            </Text>
            <Text style={[styles.noteItem, { fontFamily: primaryFontFamily }]}>
              1. {dict.note1}
            </Text>
            <Text style={[styles.noteItem, { fontFamily: primaryFontFamily }]}>
              2. {dict.note2}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
