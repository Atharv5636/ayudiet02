import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  clinic: {
    fontSize: 14,
    fontWeight: "bold",
  },
  section: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  card: {
    border: "1 solid #e5e7eb",
    borderRadius: 6,
    padding: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  label: {
    fontSize: 10,
    color: "#6b7280",
  },
  value: {
    fontSize: 12,
    fontWeight: "bold",
  },
  divider: {
    marginVertical: 10,
    borderBottom: "1 solid #e5e7eb",
  },
  dayBlock: {
    border: "1 solid #e5e7eb",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  chartContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 60,
  },
  chartBar: {
    width: 8,
    backgroundColor: "#111827",
    marginRight: 4,
    borderRadius: 2,
  },
});

export default function DietPlanPDF({ patient }) {
  const safePatient = {
    name: patient?.name || "N/A",
    age: patient?.age ?? "N/A",
    score: patient?.score ?? 0,
    issue: patient?.issue || "N/A",
    actions: Array.isArray(patient?.actions) ? patient.actions : [],
    plan: Array.isArray(patient?.plan) ? patient.plan : [],
    doctorName: patient?.doctorName || "Doctor",
    clinicName: patient?.clinicName || "AyuDiet Clinic",
    date: patient?.date || new Date().toLocaleDateString(),
    summary: patient?.summary || "AI-generated summary text here",
    chartData:
      Array.isArray(patient?.chartData) && patient.chartData.length > 0
        ? patient.chartData
        : [
            { value: 63 },
            { value: 60 },
            { value: 58 },
            { value: 55 },
            { value: 50 },
          ],
    logoSrc: patient?.logoSrc || null,
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {safePatient.logoSrc ? (
              <Image src={safePatient.logoSrc} style={{ width: 50, height: 50 }} />
            ) : null}
            <Text style={styles.clinic}>{safePatient.clinicName}</Text>
            <Text>{safePatient.doctorName}</Text>
          </View>
          <Text>{safePatient.date}</Text>
        </View>

        <Text style={styles.title}>Diet Plan Report</Text>

        <View style={[styles.section, styles.card]}>
          <View style={styles.row}>
            <Text style={styles.label}>Patient</Text>
            <Text style={styles.value}>{safePatient.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Age</Text>
            <Text style={styles.value}>{safePatient.age}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Adherence</Text>
            <Text style={styles.value}>{safePatient.score}%</Text>
          </View>
        </View>

        <View style={[styles.section, styles.card]}>
          <Text style={{ fontWeight: "bold", marginBottom: 5 }}>Key Insights</Text>
          <Text style={styles.label}>Issue</Text>
          <Text style={{ marginBottom: 5 }}>{safePatient.issue}</Text>
          <Text style={styles.label}>Recommended Actions</Text>
          {safePatient.actions.length > 0 ? (
            safePatient.actions.map((action, index) => (
              <Text key={`action-${index}`}>{`\u2022 ${action}`}</Text>
            ))
          ) : (
            <Text>{`\u2022 No recommendations available`}</Text>
          )}
          <View style={styles.divider} />
          <Text style={styles.label}>Summary</Text>
          <Text>{safePatient.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={{ fontWeight: "bold", marginBottom: 5 }}>Trend Overview</Text>
          <View style={styles.chartContainer}>
            {safePatient.chartData.map((item, index) => (
              <View
                key={`bar-${index}`}
                style={[styles.chartBar, { height: item?.value || 0 }]}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={{ fontWeight: "bold", marginBottom: 5 }}>Diet Plan</Text>
          {safePatient.plan.length > 0 ? (
            safePatient.plan.map((day, index) => (
              <View key={`day-${index}`} style={styles.dayBlock}>
                <Text style={{ fontWeight: "bold" }}>Day {index + 1}</Text>
                <Text>Breakfast: {day?.breakfast || "-"}</Text>
                <Text>Lunch: {day?.lunch || "-"}</Text>
                <Text>Dinner: {day?.dinner || "-"}</Text>
              </View>
            ))
          ) : (
            <Text>No diet plan available</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
