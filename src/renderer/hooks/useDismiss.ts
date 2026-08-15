import { useEffect, useRef } from 'react';

/**
 * 通用"点击外部 / 右键 / Esc 关闭"弹层逻辑（右键菜单、下拉菜单、弹窗等）。
 * @param open 是否展开
 * @param onClose 点击外部或右键时的关闭回调
 * @param onEscape 自定义 Esc 行为（缺省同 onClose）
 */
export function useDismiss(open: boolean, onClose: () => void, onEscape?: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const handleClose = () => closeRef.current();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') (escapeRef.current ?? closeRef.current)();
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);
}
