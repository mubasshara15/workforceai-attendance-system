import { Users, Clock, UserCheck, AlertTriangle } from "lucide-react";

interface DashboardProps {
  stats: {
    employees: number;
    present: number;
    late: number;
    absent: number;
  };
}

export default function Dashboard({ stats }: DashboardProps) {
  const cards = [
    {
      title: "Employees",
      value: stats.employees,
      icon: Users,
    },
    {
      title: "Present",
      value: stats.present,
      icon: UserCheck,
    },
    {
      title: "Late",
      value: stats.late,
      icon: Clock,
    },
    {
      title: "Absent",
      value: stats.absent,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
        >
          <card.icon className="w-6 h-6 mb-2 text-indigo-500" />
          <h3 className="text-zinc-400 text-sm">{card.title}</h3>
          <p className="text-2xl font-bold text-white">{card.value}</p>
        </div>
      ))}
    </div>
  );
}