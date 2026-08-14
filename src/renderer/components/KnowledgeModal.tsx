import { useEffect, useState } from 'react';
import { Copy, FolderOpen, RotateCcw, Sparkles, X } from 'lucide-react';
import type { KnowledgeItem, SessionRecord } from '../../shared/types';
import { folderName, formatRelativeTime } from '../session-utils';
import { MarkdownText } from './MarkdownText';

interface KnowledgeModalProps {
  onClose: () => void;
}

interface ProjectEntry {
  cwd: string;
  count: number;
}

const ESTIMATED_INPUT_TOKENS = 40000; // 与主进程 MAX_INPUT_CHARS 对应的保守估算

function keyOf(cwd: string): string {
  return cwd.replace(/[\\:]/g, '-');
}

/** 项目知识库：按项目聚合会话 → claude -p 提炼知识文档（含 token 预算提示）。 */
export function KnowledgeModal({ onClose }: KnowledgeModalProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([window.codeagentdesk.listSessions(), window.codeagentdesk.listKnowledge()])
      .then(([records, items]: [SessionRecord[], KnowledgeItem[]]) => {
        if (cancelled) return;
        setKnowledge(items);
        const map = new Map<string, number>();
        for (const record of records) {
          if (record.archived || !record.cwd) continue;
          map.set(record.cwd, (map.get(record.cwd) ?? 0) + 1);
        }
        const entries = [...map.entries()]
          .map(([cwd, count]) => ({ cwd, count }))
          .sort((a, b) => b.count - a.count);
        setProjects(entries);
      })
      .catch(() => {
        // 静默忽略加载失败。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate(cwd: string): Promise<void> {
    setGenerating(cwd);
    setError(null);
    const result = await window.codeagentdesk.generateKnowledge(cwd);
    setGenerating(null);
    if (!result.ok) {
      setError(result.message ?? '生成失败');
      return;
    }
    setKnowledge(await window.codeagentdesk.listKnowledge());
    setSelectedKey(keyOf(cwd));
    setText(result.text ?? '');
    setEditing(false);
  }

  async function handleView(key: string): Promise<void> {
    setSelectedKey(key);
    setEditing(false);
    setError(null);
    const result = await window.codeagentdesk.getKnowledge(key);
    if (result.ok) {
      setText(result.text ?? '');
    } else {
      setText(null);
      setError(result.message ?? '读取失败');
    }
  }

  async function handleSave(): Promise<void> {
    if (!selectedKey) return;
    const result = await window.codeagentdesk.saveKnowledge(selectedKey, draft);
    if (!result.ok) {
      setError(result.message ?? '保存失败');
      return;
    }
    setText(draft);
    setEditing(false);
    setKnowledge(await window.codeagentdesk.listKnowledge());
  }

  const selectedCwd = projects.find((p) => keyOf(p.cwd) === selectedKey)?.cwd ?? '';

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel knowledge-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">项目知识库</span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          <div className="knowledge-budget">
            生成约消耗 <b>{ESTIMATED_INPUT_TOKENS.toLocaleString()}</b> token（每小时限额 1000 万，约占
            0.4%）
          </div>
          {error ? <div className="knowledge-error">{error}</div> : null}

          {selectedKey && text ? (
            <>
              <div className="knowledge-head">
                <span className="knowledge-title">{folderName(selectedCwd) || selectedKey}</span>
                <div className="day-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title="复制"
                    onClick={() => void navigator.clipboard.writeText(text)}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="编辑"
                    onClick={() => {
                      setDraft(text);
                      setEditing(true);
                    }}
                  >
                    <Sparkles size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="重新生成"
                    disabled={Boolean(generating)}
                    onClick={() => void handleGenerate(selectedCwd)}
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="返回项目列表"
                    onClick={() => {
                      setSelectedKey(null);
                      setText(null);
                      setEditing(false);
                    }}
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>
              </div>
              {editing ? (
                <>
                  <textarea
                    className="summary-editor"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="编辑知识文档…"
                    aria-label="编辑知识文档"
                  />
                  <div className="day-generate-bar">
                    <button type="button" className="welcome-btn" onClick={() => setEditing(false)}>
                      取消
                    </button>
                    <button type="button" className="welcome-btn primary" onClick={() => void handleSave()}>
                      保存
                    </button>
                  </div>
                </>
              ) : (
                <MarkdownText text={text} />
              )}
            </>
          ) : (
            <div className="knowledge-list">
              {projects.length === 0 ? (
                <div className="day-empty">还没有项目会话记录</div>
              ) : (
                projects.map((project) => {
                  const item = knowledge.find((k) => k.key === keyOf(project.cwd));
                  return (
                    <div key={project.cwd} className="knowledge-project">
                      <div className="knowledge-project-info">
                        <span className="knowledge-project-name">{folderName(project.cwd)}</span>
                        <span className="knowledge-project-path">{project.cwd}</span>
                        <span className="knowledge-project-meta">
                          {project.count} 会话
                          {item ? ` · 已生成 ${formatRelativeTime(item.updatedAt)}` : ''}
                        </span>
                      </div>
                      <div className="knowledge-project-actions">
                        {generating === project.cwd ? (
                          <span className="knowledge-generating">生成中…（约 1 分钟）</span>
                        ) : item ? (
                          <>
                            <button
                              type="button"
                              className="welcome-btn"
                              onClick={() => void handleView(keyOf(project.cwd))}
                            >
                              查看
                            </button>
                            <button
                              type="button"
                              className="welcome-btn"
                              onClick={() => void handleGenerate(project.cwd)}
                            >
                              重新生成
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="welcome-btn primary"
                            onClick={() => void handleGenerate(project.cwd)}
                          >
                            生成
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
