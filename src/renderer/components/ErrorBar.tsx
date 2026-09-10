import { AlertTriangle, Check, Copy, X } from 'lucide-react';
import { useState } from 'react';

interface ErrorBarProps {
  message: string;
  onDismiss: () => void;
}

/** 全局错误条：任何模式下错误都可见（复制 / 关闭），替代各视图内联错误显示。 */
export function ErrorBar({ message, onDismiss }: ErrorBarProps) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时忽略。
    }
  }

  return (
    <div className="error-bar" role="alert">
      <AlertTriangle size={14} className="error-bar-icon" />
      <span className="error-bar-text" title={message}>
        {message}
      </span>
      <button type="button" className="error-bar-btn" onClick={() => void copy()}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? '已复制' : '复制'}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="关闭错误提示"
        title="关闭"
        onClick={onDismiss}
      >
        <X size={13} />
      </button>
    </div>
  );
}
