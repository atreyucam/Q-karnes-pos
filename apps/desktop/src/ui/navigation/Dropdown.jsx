import clsx from 'clsx';

export default function Dropdown({ open, className, children }) {
  if (!open) return null;

  return (
    <div
      className={clsx(
        'absolute right-0 mt-2 w-56 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-2 shadow-lg',
        className
      )}
    >
      {children}
    </div>
  );
}
