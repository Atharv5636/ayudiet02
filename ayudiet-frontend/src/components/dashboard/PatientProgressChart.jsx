import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getTrendColor } from "@/utils/trendUtils";

function formatValue(value, unit) {
  if (typeof value !== "number") return "-";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit || ""}`;
}

export default function PatientProgressChart({
  data,
  trend,
  unit = "%",
  valueLabel = "Adherence Score",
}) {
  const strokeColor = getTrendColor(trend);
  const hasData = Array.isArray(data) && data.length > 0;

  if (!hasData) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white">
        <p className="text-xs text-gray-400">No trend data yet</p>
      </div>
    );
  }

  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`progress-fill-${trend}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.28} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={18}
            tick={{ fontSize: 10, fill: "#6b7280" }}
          />

          <YAxis
            hide
            domain={["dataMin - 5", "dataMax + 5"]}
          />

          <Tooltip
            formatter={(value) => [formatValue(value, unit), valueLabel]}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.tooltipLabel || label}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              fontSize: "12px",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            }}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={`url(#progress-fill-${trend})`}
            fillOpacity={1}
          />

          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={3}
            dot={{ r: 3, fill: strokeColor, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: strokeColor, stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
