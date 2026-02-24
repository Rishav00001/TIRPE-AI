import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortTime } from '../../utils/formatters';

export function CrowdForecastChart({ rows }) {
  const chartData = (rows || []).map((entry) => ({
    ...entry,
    label: formatShortTime(entry.timestamp),
    predicted_footfall: Number(entry.predicted_footfall),
  }));

  if (!chartData.length) {
    return <p className="text-sm text-slate-500">No forecast data available.</p>;
  }

  const capacity = Number(chartData[0].capacity || 0);

  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <ReferenceLine y={capacity} stroke="#8f98a8" strokeDasharray="6 4" label="Capacity" />
          <Line
            type="monotone"
            dataKey="predicted_footfall"
            stroke="#0f5fa8"
            strokeWidth={2.2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
