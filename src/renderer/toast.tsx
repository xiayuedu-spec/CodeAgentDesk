import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastType = 'success' | 'error' | 'info';

/** 可选的行动按钮（如"撤销"），点击后执行并立即关闭。 */
export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_STACK = 4;
const DURATION: Record<ToastType, number> = { success: 2500, info: 3000, error: 4500 };
/** 带行动按钮的 Toast 停留更久（留出点击时间）。 */
const ACTION_DURATION = 6000;

/** 全局操作反馈：右下角 Toast 栈，自动消失、可点击关闭、最多保留 4 条；支持"撤销"类行动按钮。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((type: ToastType, message: string, action?: ToastAction) => {
    const id = ++idRef.current;
    setToasts((previous) => [...previous.slice(-(MAX_STACK - 1)), { id, type, message, action }]);
    setTimeout(
      () => {
        setToasts((previous) => previous.filter((item) => item.id !== id));
      },
      action ? ACTION_DURATION : DURATION[type],
    );
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const value: ToastContextValue = {
    success: (message, action) => push('success', message, action),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <span className="toast-dot" />
            <span className="toast-message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action?.run();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="toast-close"
              aria-label="关闭提示"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast 需在 ToastProvider 内使用');
  return context;
}
