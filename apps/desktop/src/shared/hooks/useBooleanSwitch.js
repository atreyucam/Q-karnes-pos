import { useState } from 'react';

function toKey(value) {
  return String(value);
}

export default function useBooleanSwitch({
  getId = (item) => item?.id,
  getValue = (item) => Boolean(item?.activo),
  isSensitive = (_, nextValue) => !nextValue,
  onCommit,
  onError
}) {
  const [overrides, setOverrides] = useState({});
  const [pendingIds, setPendingIds] = useState({});
  const [confirmState, setConfirmState] = useState(null);

  const setOverride = (id, nextValue) => {
    const key = toKey(id);
    setOverrides((state) => ({ ...state, [key]: nextValue }));
  };

  const clearOverride = (id) => {
    const key = toKey(id);
    setOverrides((state) => {
      if (!Object.prototype.hasOwnProperty.call(state, key)) return state;
      const nextState = { ...state };
      delete nextState[key];
      return nextState;
    });
  };

  const setPending = (id, active) => {
    const key = toKey(id);
    setPendingIds((state) => {
      const nextState = { ...state };
      if (active) nextState[key] = true;
      else delete nextState[key];
      return nextState;
    });
  };

  const resolveChecked = (item) => {
    const key = toKey(getId(item));
    return Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : Boolean(getValue(item));
  };

  const commit = async (item, nextValue, { closeConfirm = false } = {}) => {
    const id = getId(item);
    setPending(id, true);

    try {
      await onCommit?.(item, nextValue);
      clearOverride(id);
      if (closeConfirm) setConfirmState(null);
      return true;
    } catch (error) {
      clearOverride(id);
      if (closeConfirm) setConfirmState(null);
      onError?.(error, item, nextValue);
      return false;
    } finally {
      setPending(id, false);
    }
  };

  const requestChange = (item, nextValue) => {
    const id = getId(item);
    setOverride(id, nextValue);

    if (isSensitive(item, nextValue)) {
      setConfirmState({ item, nextValue });
      return;
    }

    void commit(item, nextValue);
  };

  const cancelConfirm = () => {
    if (!confirmState) return;
    clearOverride(getId(confirmState.item));
    setConfirmState(null);
  };

  const confirmChange = async () => {
    if (!confirmState) return false;
    return commit(confirmState.item, confirmState.nextValue, { closeConfirm: true });
  };

  const isPending = (item) => Boolean(pendingIds[toKey(getId(item))]);

  return {
    confirmState,
    cancelConfirm,
    confirmChange,
    isPending,
    requestChange,
    resolveChecked
  };
}
