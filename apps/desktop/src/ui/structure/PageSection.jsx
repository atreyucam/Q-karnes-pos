import clsx from 'clsx';

export default function PageSection({ className, children }) {
  return (
    <section className={clsx('ui-card p-4 sm:p-5', className)}>
      {children}
    </section>
  );
}
