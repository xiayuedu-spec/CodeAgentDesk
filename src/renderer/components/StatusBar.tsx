interface StatusBarProps {
  sessionCount: number;
  archivedCount: number;
  claudeDirName: string;
  version: string;
  onOpenSummary: () => void;
  onOpenUsageTrend: () => void;
}

export function StatusBar({
  sessionCount,
  archivedCount,
  claudeDirName,
  version,
  onOpenSummary,
  onOpenUsageTrend,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span>{sessionCount} 会话</span>
      <span>{archivedCount} 归档</span>
      <button type="button" className="status-day" title="生成今日总结" onClick={onOpenSummary}>
        今日总结
      </button>
      <button type="button" className="status-day" title="Token 用量趋势" onClick={onOpenUsageTrend}>
        用量趋势
      </button>
      <span className="status-bar-spacer" />
      <span>{claudeDirName}</span>
      <span>v{version}</span>
    </footer>
  );
}
