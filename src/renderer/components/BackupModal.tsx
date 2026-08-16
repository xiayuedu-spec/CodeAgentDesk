import { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

interface BackupModalProps {
  onClose: () => void;
}

/** 备份 / 迁移：导出或导入应用数据 JSON。会话文件在 Claude 目录，需另行备份。 */
export function BackupModal({ onClose }: BackupModalProps) {
  useEscape(true, onClose);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.codeagentdesk.exportBackup();
    setBusy(false);
    if (result.ok) setInfo(`${result.message} → ${result.path}`);
    else setError(result.message ?? '导出失败');
  }

  async function handleImport(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.codeagentdesk.importBackup();
    setBusy(false);
    if (result.ok) setInfo(`${result.message} → ${result.path}`);
    else setError(result.message ?? '导入失败');
  }

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel backup-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">备份 / 迁移</span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          <div className="backup-desc">
            备份/迁移的是应用数据（分组、置顶、归档标记、总结、知识库、配置等）。
            会话 JSONL 位于 Claude 目录（<b>~/.claude/projects</b>），建议随项目仓库或网盘一并备份。
          </div>
          <div className="backup-actions">
            <button type="button" className="welcome-btn" disabled={busy} onClick={() => void handleExport()}>
              <Download size={14} />
              导出备份
            </button>
            <button type="button" className="welcome-btn" disabled={busy} onClick={() => void handleImport()}>
              <Upload size={14} />
              导入迁移
            </button>
          </div>
          {info ? <div className="knowledge-info">{info}</div> : null}
          {error ? <div className="knowledge-error">{error}</div> : null}
          <div className="backup-tip">
            换机器：导出备份 → 新机器安装应用 → 导入迁移（先退出应用，导入后重启生效）。
          </div>
        </div>
      </div>
    </div>
  );
}
