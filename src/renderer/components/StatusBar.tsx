import { useState } from 'react';

interface StatusBarProps {
  sessionCount: number;
  archivedCount: number;
  claudeDirName: string;
  version: string;
  onOpenSummary: () => void;
  onOpenUsageTrend: () => void;
  onOpenKnowledge: () => void;
  onOpenEfficiency: () => void;
  onUnlockNeon: () => void;
}

/** 彩蛋：连点版本号次数达到该值解锁隐藏主题。 */
const NEON_CLICK_TARGET = 7;

export function StatusBar({
  sessionCount,
  archivedCount,
  claudeDirName,
  version,
  onOpenSummary,
  onOpenUsageTrend,
  onOpenKnowledge,
  onOpenEfficiency,
  onUnlockNeon,
}: StatusBarProps) {
  const [versionClicks, setVersionClicks] = useState(0);

  const handleVersionClick = (): void => {
    const next = versionClicks + 1;
    if (next >= NEON_CLICK_TARGET) {
      setVersionClicks(0);
      onUnlockNeon();
    } else {
      setVersionClicks(next);
    }
  };

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
      <button type="button" className="status-day" title="项目知识库" onClick={onOpenKnowledge}>
        知识库
      </button>
      <button type="button" className="status-day" title="每周时长 / 省时估算" onClick={onOpenEfficiency}>
        效率洞察
      </button>
      <span className="status-bar-spacer" />
      <span>{claudeDirName}</span>
      <span className="status-version" title="连点有惊喜" onClick={handleVersionClick}>
        v{version}
      </span>
    </footer>
  );
}
