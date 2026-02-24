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
import { formatShortTime } from '../../utils/formatters';

export function TrafficCorrelationChart({ rows }) {
  const chartData = (rows || []).map((entry) => ({
    ...entry,
    label: formatShortTime(entry.timestamp),
    traffic_index: Number(entry.traffic_index * 100),
    social_media_spike_index: Number(entry.social_media_spike_index * 100),
    actual_footfall: Number(entry.actual_footfall),
  }));

  if (!chartData.length) {
    return <p className="text-sm text-slate-500">No traffic correlation data available.</p>;
  }

  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" minTickGap={24} />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="actual_footfall" stroke="#144f87" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="traffic_index" stroke="#b06900" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="social_media_spike_index" stroke="#8f2d56" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
