import { interviewCall, people } from '../relay/fixtures';
import type { TranscriptExcerpt } from '../relay/interviewAssist';

const speaker = {
  james: people.recruiter.first,
  jeremy: people.candidate.first,
};

/** A transcript moment, word for word, each line with its time in the call. */
export function TranscriptQuote({ excerpt }: { excerpt: TranscriptExcerpt }) {
  return (
    <figure className="transcript">
      <figcaption>
        Interview transcript · {interviewCall.when} · synthetic demo fixture
      </figcaption>
      <ol>
        {excerpt.lines.map((l) => (
          <li key={`${l.speaker}-${l.at}`} className={l.speaker}>
            <time>{l.at}</time>
            <span className="transcript-speaker">{speaker[l.speaker]}</span>
            <p className={l.speaker === 'jeremy' ? 'voice' : ''}>{l.text}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
