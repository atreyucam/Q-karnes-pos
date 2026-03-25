import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <div className={clsx(uiClassTokens.page.header.layout, className)}>
      <div>
        {eyebrow ? <p className="ui-page-eyebrow">{eyebrow}</p> : null}
        <h1 className={uiClassTokens.page.title}>{title}</h1>
        {description ? <p className={uiClassTokens.page.subtitle}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}
