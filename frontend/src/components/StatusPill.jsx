import { clsx } from 'clsx';

export function StatusPill({ value }) {
  const style = {
    GREEN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    YELLOW: 'bg-amber-100 text-amber-800 border-amber-300',
    RED: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', style[value] || style.GREEN)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}
