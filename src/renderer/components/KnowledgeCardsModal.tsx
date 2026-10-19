import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Plus, Save, Trash2, X } from 'lucide-react';
import type { KnowledgeCard, KnowledgeCardInput, KnowledgeCardType } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';
import { useToast } from '../toast';
import { EmptyState } from './EmptyState';

interface KnowledgeCardsModalProps {
  cwd: string;
  title?: string;
  onClose: () => void;
}

const TYPES: { value: KnowledgeCardType; label: string }[] = [
  { value: 'spec', label: '规格' },
  { value: 'change', label: '变更' },
  { value: 'pitfall', label: '踩坑' },
  { value: 'decision', label: '决策' },
  { value: 'flow', label: '流程' },
  { value: 'module', label: '模块说明' },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map((type) => [type.value, type.label])) as Record<
  KnowledgeCardType,
  string
>;

/**
 * 三个字段的标题随类型变化：规格/变更读起来才不像"故障报告"。
 * 数据模型不变（仍是 phenomenon/conclusion/evidence），只换界面用词。
 */
const SECTION_LABELS: Record<
  KnowledgeCardType,
  { phenomenon: string; conclusion: string; evidence: string }
> = {
  spec: {
    phenomenon: '需求背景',
    conclusion: '规格内容（行为/参数/边界/验收）',
    evidence: '依据（文件:行 或 会话要点）',
  },
  change: {
    phenomenon: '变更原因',
    conclusion: '变更内容与影响（改了什么/影响谁/迁移注意）',
    evidence: '依据（文件:行 或 提交）',
  },
  pitfall: {
    phenomenon: '现象（看到什么）',
    conclusion: '结论（根因 / 怎么解决）',
    evidence: '证据（文件:行 / 会话 id）',
  },
  decision: {
    phenomenon: '背景与约束',
    conclusion: '决策与理由（放弃了什么）',
    evidence: '依据',
  },
  flow: {
    phenomenon: '适用场景',
    conclusion: '步骤',
    evidence: '依据',
  },
  module: {
    phenomenon: '这个模块负责什么',
    conclusion: '关键位置与容易误解的点',
    evidence: '依据（文件:行）',
  },
};

interface Draft {
  slug?: string;
  title: string;
  type: KnowledgeCardType;
  status: 'draft' | 'verified';
  files: string;
  phenomenon: string;
  conclusion: string;
  evidence: string;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  type: 'pitfall',
  status: 'draft',
  files: '',
  phenomenon: '',
  conclusion: '',
  evidence: '',
};

function toDraft(card: KnowledgeCard): Draft {
  return {
    slug: card.slug,
    title: card.title,
    type: card.type,
    status: card.status,
    files: card.files.join('\n'),
    phenomenon: card.phenomenon,
    conclusion: card.conclusion,
    evidence: card.evidence,
  };
}

/**
 * 项目知识卡片：仓库内 `docs/knowledge/<slug>.md`（一卡一文件 + 自动索引）。
 * 与 AI 生成的 `PROJECT_KNOWLEDGE.md` 互补——那是概览，这里是可查、可验证、可过期的条目。
 */
export function KnowledgeCardsModal({ cwd, title, onClose }: KnowledgeCardsModalProps) {
  useEscape(true, onClose);
  const toast = useToast();
  const [cards, setCards] = useState<KnowledgeCard[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(
    (selectSlug?: string) => {
      window.codeagentdesk
        .listKnowledgeCards(cwd)
        .then((value) => {
          setCards(value);
          if (selectSlug) {
            const found = value.find((card) => card.slug === selectSlug);
            if (found) setDraft(toDraft(found));
          }
        })
        .catch(() => setCards([]));
    },
    [cwd],
  );

  useEffect(() => load(), [load]);

  const save = useCallback(async () => {
    if (!draft || saving) return;
    if (!draft.title.trim()) {
      toast.info('先填个标题');
      return;
    }
    setSaving(true);
    try {
      const input: KnowledgeCardInput = {
        slug: draft.slug,
        title: draft.title,
        type: draft.type,
        status: draft.status,
        files: draft.files.split('\n').map((item) => item.trim()).filter(Boolean),
        phenomenon: draft.phenomenon,
        conclusion: draft.conclusion,
        evidence: draft.evidence,
      };
      const saved = await window.codeagentdesk.saveKnowledgeCard(cwd, input);
      toast.success('已保存到 docs/knowledge/');
      setConfirmDelete(false);
      load(saved.slug);
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [cwd, draft, load, saving, toast]);

  const remove = useCallback(async () => {
    if (!draft?.slug) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const result = await window.codeagentdesk.deleteKnowledgeCard(cwd, draft.slug);
    if (!result.ok) {
      toast.error('删除失败');
      return;
    }
    setConfirmDelete(false);
    setDraft(null);
    toast.success('已删除');
    load();
  }, [confirmDelete, cwd, draft, load, toast]);

  const grouped = TYPES.map((type) => ({
    ...type,
    items: (cards ?? []).filter((card) => card.type === type.value),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel cards-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <BookMarked size={14} /> 知识卡片
            {title ? <span className="diff-session">{title}</span> : null}
            <span className="diff-branch">docs/knowledge/</span>
          </span>
          <div className="day-actions">
            <button
              type="button"
              className="diff-stage-all"
              onClick={() => {
                setConfirmDelete(false);
                setDraft({ ...EMPTY_DRAFT });
              }}
            >
              <Plus size={12} /> 新建
            </button>
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="day-body cards-body">
          {cards === null ? (
            <div className="cards-loading">读取中…</div>
          ) : (
            <div className="cards-split">
              <div className="cards-list">
                {grouped.length === 0 ? (
                  <div className="cards-empty">
                    <EmptyState
                      icon={<BookMarked size={18} strokeWidth={1.6} />}
                      title="还没有卡片"
                      hint="把踩过的坑、做过的决策记成卡片，新同事就能查到"
                    />
                  </div>
                ) : (
                  grouped.map((group) => (
                    <section key={group.value}>
                      <div className="cards-group-label">
                        {group.label}
                        <span>{group.items.length}</span>
                      </div>
                      <ul>
                        {group.items.map((card) => (
                          <li key={card.slug}>
                            <button
                              type="button"
                              className={`cards-item${
                                draft?.slug === card.slug ? ' active' : ''
                              }`}
                              title={card.title}
                              onClick={() => {
                                setConfirmDelete(false);
                                setDraft(toDraft(card));
                              }}
                            >
                              <span className={`cards-dot ${card.status}`} />
                              <span className="cards-item-title">{card.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>

              <div className="cards-editor">
                {!draft ? (
                  <div className="cards-hint">
                    左侧选一张卡片编辑，或点右上「新建」。
                    <br />
                    卡片存放在项目的 <code>docs/knowledge/</code>，跟着 git 走 —— 提交后同事拉代码就能看到。
                  </div>
                ) : (
                  <>
                    <div className="cards-field">
                      <span className="cards-label">标题</span>
                      <input
                        className="cards-input"
                        value={draft.title}
                        placeholder="一句话说清这条知识"
                        onChange={(event) =>
                          setDraft({ ...draft, title: event.target.value })
                        }
                      />
                    </div>
                    <div className="cards-field-row">
                      <label className="cards-field">
                        <span className="cards-label">类型</span>
                        <select
                          className="cards-input"
                          value={draft.type}
                          onChange={(event) =>
                            setDraft({ ...draft, type: event.target.value as KnowledgeCardType })
                          }
                        >
                          {TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="cards-field">
                        <span className="cards-label">可信度</span>
                        <select
                          className="cards-input"
                          value={draft.status}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              status: event.target.value as 'draft' | 'verified',
                            })
                          }
                        >
                          <option value="draft">草稿（待确认）</option>
                          <option value="verified">已确认</option>
                        </select>
                      </label>
                    </div>
                    <label className="cards-field">
                      <span className="cards-label">{SECTION_LABELS[draft.type].phenomenon}</span>
                      <textarea
                        className="cards-textarea"
                        rows={2}
                        value={draft.phenomenon}
                        placeholder="报错原文、异常表现、复现步骤…"
                        onChange={(event) =>
                          setDraft({ ...draft, phenomenon: event.target.value })
                        }
                      />
                    </label>
                    <label className="cards-field">
                      <span className="cards-label">{SECTION_LABELS[draft.type].conclusion}</span>
                      <textarea
                        className="cards-textarea"
                        rows={3}
                        value={draft.conclusion}
                        placeholder="根因 + 改法；新同事照着就能修复"
                        onChange={(event) =>
                          setDraft({ ...draft, conclusion: event.target.value })
                        }
                      />
                    </label>
                    <label className="cards-field">
                      <span className="cards-label">{SECTION_LABELS[draft.type].evidence}</span>
                      <textarea
                        className="cards-textarea"
                        rows={2}
                        value={draft.evidence}
                        placeholder="src/main/xxx.ts:239 · 会话 b12c293"
                        onChange={(event) =>
                          setDraft({ ...draft, evidence: event.target.value })
                        }
                      />
                    </label>
                    <label className="cards-field">
                      <span className="cards-label">涉及文件（每行一个，用于判断过期）</span>
                      <textarea
                        className="cards-textarea mono"
                        rows={2}
                        value={draft.files}
                        placeholder="src/main/knowledge-cards.ts"
                        onChange={(event) => setDraft({ ...draft, files: event.target.value })}
                      />
                    </label>
                    <div className="cards-actions">
                      <button
                        type="button"
                        className="rail-action primary"
                        disabled={saving}
                        onClick={() => void save()}
                      >
                        <Save size={12} /> 保存
                      </button>
                      {draft.slug ? (
                        <>
                          <button
                            type="button"
                            className={`rail-action${confirmDelete ? ' danger' : ''}`}
                            onClick={() => void remove()}
                          >
                            <Trash2 size={12} />
                            {confirmDelete ? '确认删除？' : '删除'}
                          </button>
                          <span className="cards-path">
                            {TYPE_LABEL[draft.type]} · {draft.slug}.md
                          </span>
                        </>
                      ) : (
                        <span className="cards-path">新建卡片</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
