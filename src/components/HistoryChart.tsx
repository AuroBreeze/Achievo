import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const HistoryChart: React.FC = () => {
  const [data, setData] = useState<{ timestamp: number; score: number }[]>([]);

  useEffect(() => {
    window.api?.getHistory().then((items: any[]) => setData(items || []));
  }, []);

  const labels = data.map(d => new Date(d.timestamp).toLocaleString());
  const values = data.map(d => d.score);

  return (
    <div className="bg-slate-800 rounded p-4">
      <h3 className="font-medium mb-2">历史分数</h3>
      <Line
        data={{
          labels,
          datasets: [{ label: '进步分数', data: values, borderColor: '#4f46e5' }],
        }}
        options={{ responsive: true, scales: { y: { beginAtZero: true, suggestedMax: 100 } } }}
      />
    </div>
  );
};

export default HistoryChart;
