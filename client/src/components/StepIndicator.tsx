/**
 * StepIndicator — Gmail→OCR→見積→帳票 の 4ステップ進捗バー
 *
 * 使用例:
 *   <StepIndicator
 *     currentStep={2}            // 1〜4 の現在ステップ
 *     completedSteps={[1, 2]}    // 完了済みステップ
 *   />
 */

import { CheckCircle2, CircleDot, Mail, ScanLine, ClipboardList, FileText } from 'lucide-react';

// ─── 型定義 ─────────────────────────────────────────────────────────────────

export type WorkflowStep = 1 | 2 | 3 | 4;

export interface StepIndicatorProps {
  /** 現在アクティブなステップ (1〜4) */
  currentStep: WorkflowStep;
  /** 完了済みステップのリスト */
  completedSteps?: WorkflowStep[];
  /** Gmail受信ボタンを押したときのコールバック */
  onGmailClick?: () => void;
}

// ─── ステップ定義 ────────────────────────────────────────────────────────────

interface StepDef {
  step: WorkflowStep;
  label: string;
  sublabel: string;
  Icon: React.FC<{ className?: string }>;
}

const STEPS: StepDef[] = [
  {
    step: 1,
    label: 'Gmail受信',
    sublabel: '見積依頼メール',
    Icon: Mail,
  },
  {
    step: 2,
    label: 'OCR解析',
    sublabel: '図面・数量読み取り',
    Icon: ScanLine,
  },
  {
    step: 3,
    label: '見積入力',
    sublabel: '工種別数量・単価',
    Icon: ClipboardList,
  },
  {
    step: 4,
    label: '帳票出力',
    sublabel: '見積書・単価根拠表',
    Icon: FileText,
  },
];

// ─── サブコンポーネント ──────────────────────────────────────────────────────

function StepNode({
  def,
  isActive,
  isCompleted,
  isClickable,
  onClick,
}: {
  def: StepDef;
  isActive: boolean;
  isCompleted: boolean;
  isClickable: boolean;
  onClick?: () => void;
}) {
  const { Icon, step, label, sublabel } = def;

  // カラースタイル
  let circleClass: string;
  let textClass: string;
  let borderClass: string;

  if (isCompleted) {
    circleClass = 'bg-emerald-500 text-white border-emerald-500';
    textClass = 'text-emerald-700';
    borderClass = 'border-emerald-200 bg-emerald-50';
  } else if (isActive) {
    circleClass = 'bg-indigo-600 text-white border-indigo-600';
    textClass = 'text-indigo-800';
    borderClass = 'border-indigo-200 bg-indigo-50';
  } else {
    circleClass = 'bg-slate-100 text-slate-400 border-slate-200';
    textClass = 'text-slate-400';
    borderClass = 'border-transparent bg-transparent';
  }

  const clickProps = isClickable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') onClick?.();
        },
        className: `flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-3 py-2 transition-colors hover:opacity-80 ${borderClass}`,
      }
    : {
        className: `flex flex-col items-center gap-1 rounded-lg border px-3 py-2 ${borderClass}`,
      };

  return (
    <div {...clickProps}>
      {/* アイコン円 */}
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${circleClass}`}
        aria-label={`ステップ${step}`}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : isActive ? (
          <CircleDot className="h-5 w-5" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>

      {/* ラベル */}
      <div className={`text-center ${textClass}`}>
        <div className="text-[11px] font-semibold uppercase tracking-wide">
          STEP {step}
        </div>
        <div className="text-xs font-semibold leading-tight">{label}</div>
        <div className="text-[10px] leading-tight opacity-70">{sublabel}</div>
      </div>

      {/* クリック可能ヒント */}
      {isClickable && (
        <div className="text-[9px] font-semibold text-indigo-600">
          クリックで開く
        </div>
      )}
    </div>
  );
}

function Connector({ passed }: { passed: boolean }) {
  return (
    <div className="flex flex-1 items-center">
      <div
        className={`h-0.5 w-full rounded-full transition-colors ${
          passed ? 'bg-emerald-300' : 'bg-slate-200'
        }`}
      />
      <svg
        width="8"
        height="10"
        viewBox="0 0 8 10"
        className={`flex-shrink-0 ${passed ? 'text-emerald-300' : 'text-slate-200'}`}
        fill="currentColor"
      >
        <path d="M0 0 L8 5 L0 10 Z" />
      </svg>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function StepIndicator({
  currentStep,
  completedSteps = [],
  onGmailClick,
}: StepIndicatorProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {/* ヘッダー */}
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
        作業フロー — Gmail受信 → OCR解析 → 見積入力 → 帳票出力
      </div>

      {/* ステップ列 */}
      <div className="flex items-center gap-1">
        {STEPS.map((def, idx) => {
          const isCompleted = completedSteps.includes(def.step);
          const isActive = def.step === currentStep && !isCompleted;
          const isClickable = def.step === 1 && typeof onGmailClick === 'function';

          return (
            <div key={def.step} className="flex min-w-0 flex-1 items-center">
              <StepNode
                def={def}
                isActive={isActive}
                isCompleted={isCompleted}
                isClickable={isClickable}
                onClick={isClickable ? onGmailClick : undefined}
              />
              {idx < STEPS.length - 1 && (
                <Connector passed={completedSteps.includes(def.step)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
