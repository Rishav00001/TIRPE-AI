import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const barColors = ['#14558f', '#31528d'];

export function CapacityComparisonChart({ rows }) {
  const chartData = (rows || []).map((entry) => ({
    name: entry.name,
    Predicted: Number(entry.predicted_footfall),
    Capacity: Number(entry.capacity),
  }));

  if (!chartData.length) {
    return <p className="text-sm text-slate-500">No capacity comparison available.</p>;
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={52} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="Predicted" radius={[4, 4, 0, 0]}>
            {chartData.map((item, index) => (
              <Cell key={`${item.name}-pred`} fill={barColors[index % barColors.length]} />
            ))}
          </Bar>
          <Bar dataKey="Capacity" fill="#8f98a8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
