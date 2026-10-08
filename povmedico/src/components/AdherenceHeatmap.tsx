import { today } from '../domain/clock';

interface AdherenceHeatmapProps {
  logs: { date: string; completed: boolean }[];
  days?: number;
}

export function AdherenceHeatmap({ logs, days = 7 }: AdherenceHeatmapProps) {
  const now = today();
  const cells: ('done' | 'missed' | 'none')[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const log = logs.find(l => l.date === dateStr);
    if (!log) cells.push('none');
    else cells.push(log.completed ? 'done' : 'missed');
  }

  return (
    <div className="flex items-center gap-[3px]" title={`Adherencia últimos ${days} días`}>
      {cells.map((cell, i) => (
        <div
          key={i}
          className={`w-[7px] h-[7px] rounded-[2px] transition-colors ${
            cell === 'done' ? 'bg-ok' :
            cell === 'missed' ? 'bg-alert/60' :
            'bg-clay-border'
          }`}
        />
      ))}
    </div>
  );
}
