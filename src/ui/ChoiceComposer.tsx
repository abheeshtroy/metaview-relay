import { useState } from 'react';

export interface Choice<Id extends string> {
  id: Id;
  label?: string;
  text: string;
}

interface Props<Id extends string> {
  choices: Choice<Id>[];
  submitLabel: string;
  hint?: string;
  /** Starts with a blank own-words response rather than a scripted demo reply. */
  freeform?: boolean;
  /** Shown while editing, to say what happens to changed wording. */
  editNote?: string;
  onSubmit: (id: Id, text: string) => void;
}

/** Scripted replies with an optional edit. The reducer decides what edited text means. */
export function ChoiceComposer<Id extends string>({
  choices,
  submitLabel,
  hint,
  freeform = false,
  editNote,
  onSubmit,
}: Props<Id>) {
  const [selected, setSelected] = useState<Id | null>(
    choices.length === 1 ? choices[0].id : null,
  );
  const [editing, setEditing] = useState(freeform);
  const [draft, setDraft] = useState('');
  const choice = choices.find((c) => c.id === selected);

  const select = (id: Id) => {
    setSelected(id);
    setEditing(false);
  };
  const startEdit = () => {
    if (!choice) return;
    setDraft(choice.text);
    setEditing(true);
  };
  const submit = () => {
    if (!choice) return;
    onSubmit(choice.id, editing ? draft : choice.text);
  };

  return (
    <div className="composer">
      {choices.length > 1 && (
        <div className="choices" role="radiogroup">
          {choices.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={selected === c.id}
              className={`choice ${selected === c.id ? 'selected' : ''}`}
              onClick={() => select(c.id)}
            >
              {c.label && <span className="choice-label">{c.label}</span>}
              <span className="voice">{c.text}</span>
            </button>
          ))}
        </div>
      )}
      {choices.length === 1 && !editing && choice && (
        <p className="voice composer-preview">{choice.text}</p>
      )}
      {editing && (
        <textarea
          className="voice"
          value={draft}
          rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 70)))}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Edit reply"
          autoFocus
          onFocus={(e) => e.target.setSelectionRange(draft.length, draft.length)}
        />
      )}
      {editing && editNote && <p className="edit-note">{editNote}</p>}
      <div className="composer-actions">
        {hint && <span className="hint">{hint}</span>}
        {choice && !editing && !freeform && (
          <button className="ghost" onClick={startEdit}>
            Edit first
          </button>
        )}
        <button
          className="pill"
          disabled={!choice || (editing && !draft.trim())}
          onClick={submit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
