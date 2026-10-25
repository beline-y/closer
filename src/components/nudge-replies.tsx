import { CloserIcon, REACTION_TONE } from "@/components/icons/closer-icon";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import type { NudgeReply } from "@/lib/data/nudges";
import { relativeDay } from "@/lib/dates";
import { nudgeKind } from "@/lib/nudges";

// Replies to the patient's nudges ("Mom [heart] Coming tonight!"). Only replies, never "no answer".
export function NudgeReplies({ replies }: { replies: NudgeReply[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {replies.map((r) => {
        const who = r.from.relationship === "Mom" || r.from.relationship === "Dad" ? r.from.relationship : r.from.name;
        return (
          <li key={`${r.nudgeId}-${r.from.id}`} className="flex animate-rise items-start gap-3">
            <PersonaAvatar person={r.from} size="md" decorative />
            <div className="flex flex-col gap-1 rounded-3xl rounded-tl-md bg-card p-4 shadow-sm ring-1 ring-border">
              <p className="flex flex-wrap items-center gap-x-1.5 text-lg">
                <span className="font-bold">{who}</span>
                {r.replyKey && <CloserIcon name={r.replyKey} className={REACTION_TONE[r.replyKey]} />} {r.text}
              </p>
              <p className="text-sm text-muted-foreground">
                To your “{nudgeKind(r.kind).label}” · {relativeDay(r.daysAgo)}, {r.time}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
