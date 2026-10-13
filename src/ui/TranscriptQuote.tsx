import { people } from '../relay/fixtures';
import type { TranscriptExcerpt } from '../relay/interviewAssist';

const speaker = {
  james: people.recruiter.first,
  jeremy: people.candidate.first,
};

/**
 * A transcript moment, word for word, each line with its time in the call.
 * `live` plays the lines in one at a time, as they were said.
 */
export function TranscriptQuote({
  excerpt,
  day,
  live = false,
}: {
  excerpt: TranscriptExcerpt;
  day: string;
  live?: boolean;
}) {
  return (
    <figure className={`transcript ${live ? 'live' : ''}`}>
      <figcaption>Quoted from the call · {day} · synthetic transcript</figcaption>
      <ol>
        {excerpt.lines.map((l, i) => (
          <li
            key={`${l.speaker}-${l.at}`}
            className={l.speaker}
            style={live ? { animationDelay: `${i * 0.9}s` } : undefined}
          >
            <time>{l.at}</time>
            <span className="transcript-speaker">{speaker[l.speaker]}</span>
            <p className={l.speaker === 'jeremy' ? 'voice' : ''}>{l.text}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
