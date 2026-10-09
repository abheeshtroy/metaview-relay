import { useState } from 'react';
import type { RelayEvent } from '../relay/events';
import { people, scriptedAddendum } from '../relay/fixtures';
import type { CandidateInterviewView } from '../relay/reduce';
import { ChoiceComposer } from './ChoiceComposer';
import { GuideScreen } from './GuideScreen';
import { TranscriptQuote } from './TranscriptQuote';

interface Props {
  interview: CandidateInterviewView;
  onEvent: (event: RelayEvent) => void;
}

const james = people.recruiter.first;

/** Step 2: Jeremy receives the topic James approved, and nothing else. */
export function PrepNoteScreen({ interview, onEvent }: Props) {
  return (
    <GuideScreen
      eyebrow={`Your interview · ${interview.call}`}
      headline={`${james} would like to talk about one topic.`}
      why={`${james} chose a topic, not a verdict. Knowing it in advance lets you think it over, and there’s nothing to write.`}
      relay={`passed on only the topic ${james} approved. His notes and reasons stay with the hiring team.`}
      next={`The conversation happens between you and ${james}. Relay is not in the call.`}
      actions={
        <button
          className="pill"
          onClick={() => onEvent({ type: 'interview-call-started' })}
        >
          Continue to the interview
        </button>
      }
    >
      {interview.prep && (
        <div className="prep-note">
          <p className="tag human-tag">
            <span className="initials">{people.recruiter.initials}</span>
            From {james} · approved by him
          </p>
          <p className="prep-topic">{interview.prep}</p>
        </div>
      )}
    </GuideScreen>
  );
}

/** Step 4: Jeremy checks the exact excerpt before James receives it. */
export function CheckScreen({ interview, onEvent }: Props) {
  const [adding, setAdding] = useState(false);
  if (!interview.excerpt) return null;

  return (
    <GuideScreen
      eyebrow="After the call · from the transcript"
      headline={`Check what ${james} will receive.`}
      why={`These are your exact words, with timestamps. ${james} sees them only after you’ve checked them.`}
      relay={`found the moment ${james} asked his question and quoted it word for word. Nothing is summarised or rewritten.`}
      next={`${james} reviews this excerpt, anything you add, and Relay’s coverage note.`}
      actions={
        adding ? (
          <button className="text-button" onClick={() => setAdding(false)}>
            Back
          </button>
        ) : (
          <>
            <button className="ghost" onClick={() => setAdding(true)}>
              Add context
            </button>
            <button
              className="pill"
              onClick={() => onEvent({ type: 'interview-recap-confirmed' })}
            >
              Looks right
            </button>
          </>
        )
      }
    >
      <TranscriptQuote excerpt={interview.excerpt} />
      {adding && (
        <div className="recap-add">
          <p className="tag">Something you didn’t get to say · in your own words</p>
          <ChoiceComposer
            choices={[{ id: 'addendum', text: scriptedAddendum }]}
            submitLabel="Send with my context"
            hint="Suggested addition for this demo"
            editNote={`Edited or not, this goes to ${james} exactly as you wrote it. Relay won’t interpret it.`}
            onSubmit={(_, text) =>
              onEvent({ type: 'interview-recap-confirmed', addendum: text })
            }
          />
        </div>
      )}
    </GuideScreen>
  );
}
