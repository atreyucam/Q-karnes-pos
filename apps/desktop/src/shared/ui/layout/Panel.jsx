import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function Panel({ as = 'section', className, children, ...props }) {
  const Tag = as;
  return (
    <Tag className={clsx(uiClassTokens.card.base, className)} {...props}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, description, actions, className }) {
  return (
    <div className={clsx(uiClassTokens.card.header, 'flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        {title ? <h3 className={uiClassTokens.card.headerTitle}>{title}</h3> : null}
        {description ? <p className={uiClassTokens.card.headerSubtitle}>{description}</p> : null}
      </div>
      {actions ? <div className="inline-flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelSection({ className, children }) {
  return <div className={clsx(uiClassTokens.card.body, className)}>{children}</div>;
}
