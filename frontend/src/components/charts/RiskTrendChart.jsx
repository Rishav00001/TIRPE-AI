import { format } from 'date-fns';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const lineColors = ['#12589B', '#2E7D32', '#B06900', '#8C1D18', '#4E4D9B'];

function toChartData(rows) {
  const byTimestamp = new Map();

  rows.forEach((row) => {
    const key = new Date(row.timestamp).toISOString();
    if (!byTimestamp.has(key)) {
      byTimestamp.set(key, {
        timestamp: key,
        label: format(new Date(key), 'HH:mm'),
      });
    }

    byTimestamp.get(key)[row.location_name] = Number(row.risk_score.toFixed(2));
  });

  return Array.from(byTimestamp.values());
}

export function RiskTrendChart({ rows }) {
  const chartData = toChartData(rows || []);
  const locations = [...new Set((rows || []).map((entry) => entry.location_name))];

  if (!chartData.length) {
    return <p className="text-sm text-slate-500">No trend data available.</p>;
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" minTickGap={28} />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Legend />
          {locations.map((location, index) => (
            <Line
              key={location}
              type="monotone"
              dataKey={location}
              stroke={lineColors[index % lineColors.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
