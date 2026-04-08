export default function StatCard({
  title,
  value,
  subtitle,
  trend,
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md">
      <p className="text-gray-900 font-semibold">{title}</p>

      <div className="flex items-end gap-3 mt-2">
        <h2 className="text-3xl font-semibold text-gray-900">{value}</h2>

        {trend && (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
            {trend}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      )}
    </div>
  );
}
