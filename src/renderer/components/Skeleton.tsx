interface SkeletonProps {
  height?: number;
  width?: string;
}

/** 骨架屏占位块（统一弹窗/列表的加载形态）。 */
export function Skeleton({ height = 14, width = '100%' }: SkeletonProps) {
  return <span className="skeleton" style={{ height, width, display: 'block' }} />;
}

/** 多行骨架（首行更粗，模拟标题 + 内容）。 */
export function SkeletonStack({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          height={index === 0 ? 20 : 14}
          width={index === 0 ? '58%' : index === rows - 1 ? '82%' : '100%'}
        />
      ))}
    </div>
  );
}
