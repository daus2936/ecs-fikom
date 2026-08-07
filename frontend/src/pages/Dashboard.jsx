import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Time-based greeting berdasarkan jam WIB (Asia/Jakarta):
 *   04:00–10:59 → Selamat pagi
 *   11:00–14:59 → Selamat siang
 *   15:00–17:59 → Selamat sore
 *   18:00–03:59 → Selamat malam
 */
function getGreeting() {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
    10
  );
  if (hour >= 4  && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-500 mt-1">
        {getGreeting()}, {user?.full_name}.
      </p>
    </div>
  );
}
