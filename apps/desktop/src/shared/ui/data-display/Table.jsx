import { Children, cloneElement, isValidElement } from 'react';
import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

function decorateRows(children, rowClassName) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child, {
      className: clsx(rowClassName, child.props.className)
    });
  });
}

export function Table({ children, className }) {
  return (
    <div className={clsx(uiClassTokens.table.wrapper, className)}>
      <div className="overflow-x-auto">
        <table className={uiClassTokens.table.base}>{children}</table>
      </div>
    </div>
  );
}

export function TableHead({ children }) {
  return <thead>{decorateRows(children, uiClassTokens.table.headRow)}</thead>;
}

export function TableBody({
  children,
  emptyMessage = 'No existen registros.',
  emptyColSpan = 99
}) {
  const rows = Children.toArray(children);

  return (
    <tbody className={uiClassTokens.table.body}>
      {rows.length > 0 ? rows : (
        <tr>
          <td colSpan={emptyColSpan} className={clsx(uiClassTokens.table.cell, uiClassTokens.table.empty, 'text-text-muted')}>
            {emptyMessage}
          </td>
        </tr>
      )}
    </tbody>
  );
}

export function TableRow({ children, className }) {
  return <tr className={clsx(uiClassTokens.table.row, className)}>{children}</tr>;
}

export function TableCell({ children, className, as = 'td', ...props }) {
  const Tag = as;
  return (
    <Tag className={clsx(as === 'th' ? uiClassTokens.table.headCell : uiClassTokens.table.cell, className)} {...props}>
      {children}
    </Tag>
  );
}
