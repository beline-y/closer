import { Bell, ShieldCheck } from "lucide-react";
import { loadWellbeingDashboard } from "@/lib/wellbeing/dashboard";
import { acknowledgeReview, notificationFeedback, saveConsent, saveNotificationPrefs } from "@/lib/wellbeing/actions";
import { ActionForm, LiveNotifications } from "./controls";
import { isDemoMode } from "@/lib/demo-mode";
import { demoInvitationRole } from "@/lib/wellbeing/demo-access";
import { DemoInvitation } from "./demo-invitation";

const inputClass = "min-h-14 w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30";
const panelClass = "rounded-3xl border border-border bg-card p-5 sm:p-7";

function ConsentControl({ id, name, enabled }: { id: string; name: string; enabled: boolean }) {
  return <section className={panelClass}>
    <div className="mb-4 flex items-center gap-3"><ShieldCheck className="size-6 text-role-care" aria-hidden />
      <h2 className="text-xl font-extrabold">Daily support for {name}</h2></div>
    <p className="mb-3 font-bold">Daily wellbeing reviews use AI (Mistral). You can turn this off anytime.</p>
    <p className="mb-4 text-muted-foreground">{enabled ? "Daily reviews are on." : "Daily reviews are off."} With your permission, Mistral reads new shared mood check-ins, activities and notes, plus an approximate age, to suggest support and conversation topics. Linked care staff can see the review and its supporting excerpts. Guardians get gentle prompts to connect.</p>
    <p className="mb-5 text-sm text-muted-foreground">Private journals, locked answers, photos and sealed cards are excluded. AI can miss or misread things; this is not a diagnosis or an emergency service. Turning this off stops future processing and prompts; existing reviews stay available to your care team.</p>
    <ActionForm action={saveConsent} label={enabled ? "Stop daily reviews" : "Enable daily reviews"}>
      <input type="hidden" name="patient_id" value={id} /><input type="hidden" name="enabled" value={String(!enabled)} />
      {!enabled && <label className="flex min-h-14 items-start gap-3 rounded-xl bg-secondary p-4"><input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" name="agree" value="yes" required />
        <span>I agree to send these shared responses to Mistral for daily reviews and personalized prompts. I can turn this off at any time.</span></label>}
    </ActionForm>
  </section>;
}

const levelLabels: Record<string, string> = { insufficient_data: "Not enough information", routine: "Daily observation", check_in: "Check-in suggested", priority: "Priority · human review" };

export async function WellbeingPanel({ role }: { role: "patient" | "family" | "care" }) {
  const data = await loadWellbeingDashboard(role);
  const isChild = role === "patient";
  if (data.state === "signed_out" || data.state === "wrong_role") return null;
  if (data.state !== "ready") return <aside className={panelClass} role="status">
    <h2 className="mb-2 text-xl font-extrabold">{isChild ? "Little moments together" : "Daily wellbeing & connection"}</h2>
    <p className="text-muted-foreground">{data.state === "error" ? "Daily support could not load. Please try again shortly."
      : "Daily support is being set up. You can keep sharing your day and connecting with your people."}</p>
  </aside>;
  return <section className="flex flex-col gap-5" aria-label={isChild ? "Little moments together" : "Daily wellbeing and connection"}>
    <LiveNotifications userId={data.userId} />
    {/* The AI demo is for the guardian side only: no AI on the patient's screens, and a child never triggers an AI request. */}
    {role === "family" && isDemoMode() && data.patients.filter((p) => demoInvitationRole(data.userId, p.id, role) === role).map((p) =>
      <DemoInvitation key={`${data.userId}:${p.id}`} patientId={p.id} name={p.nickname} role={role} />)}
    {isChild && <p className="rounded-2xl bg-role-patient-soft p-4 text-lg">Need help now? Tell a trusted grown-up or your care team.</p>}
      <section aria-labelledby="inbox-heading" className="flex flex-col gap-4">
        <h2 id="inbox-heading" className="flex items-center gap-3 text-2xl font-extrabold"><Bell className="size-6 text-primary" aria-hidden /> {isChild ? "A little invitation for you" : role === "care" ? "Support inbox" : "Your daily invitations"}</h2>
        {data.notifications.length ? data.notifications.map((n) => <article key={n.id} className={`${panelClass} ${n.kind === "wellbeing_alert" ? "border-l-4 border-l-role-care" : "border-l-4 border-l-primary"}`}>
          <div className="mb-3 flex flex-wrap justify-between gap-2"><h3 className="text-xl font-extrabold">{n.title}</h3><span className="text-sm text-muted-foreground">{data.patients.find((p) => p.id === n.patient_id)?.nickname} · {n.for_date}</span></div>
          <p className="mb-5 text-lg leading-relaxed">{n.body}</p>
          {n.feedback ? <p className="text-sm text-muted-foreground">Response saved. Thank you 💛</p> : <ActionForm action={notificationFeedback} label="Save my response">
            <input type="hidden" name="id" value={n.id} />
            <label className="sr-only" htmlFor={`feedback-${n.id}`}>Your response</label>
            <select className={inputClass} name="feedback" id={`feedback-${n.id}`} defaultValue="helpful">
              <option value="helpful">{isChild ? "I like this 💛" : "Helpful"}</option><option value="not_now">Another time</option><option value="connected">We connected</option>
            </select>
          </ActionForm>}
        </article>) : <div className={`${panelClass} text-muted-foreground`}>{isChild ? "Your little invitations will arrive here. You can always say hello to someone you love."
          : "New daily prompts will arrive here after an opted-in review. You can make a little moment together anytime."}</div>}
      </section>
      {role === "care" && <section aria-labelledby="reviews-heading" className="flex flex-col gap-4">
        <h2 id="reviews-heading" className="text-2xl font-extrabold">Daily reviews</h2>
        <p className="text-muted-foreground">AI support signals need human review. A routine observation does not establish safety. For immediate concerns, use your usual care and safeguarding procedures.</p>
        {!data.reviews.length && <p className={panelClass}>No daily reviews yet. A guardian or adult patient must first enable them.</p>}
        {data.reviews.map((r) => <article key={r.id} className={`${panelClass} ${r.level === "priority" ? "border-2 border-destructive" : ""}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-extrabold">{data.patients.find((p) => p.id === r.patient_id)?.nickname} · {r.for_date}</h3>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${r.level === "priority" ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}>{r.status === "processing" ? "Review in progress" : levelLabels[r.level ?? ""]}</span></div>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground">
            {r.source === "mistral" && r.status !== "processing" && <span className="rounded-full bg-role-care-soft px-2.5 py-0.5 text-role-care-ink">AI-generated</span>}
            {r.status === "processing" ? "Waiting for the review to finish" : r.source === "mistral" ? `Mistral · ${r.model}` : r.source === "no_data" ? "No shared responses · fixed reminders only" : "Rules only · AI review unavailable"}
          </p>
          <p className="mb-4 leading-relaxed">{r.summary}</p>
          {r.safeguarding_concern && <p className="mb-4 rounded-xl bg-destructive/10 p-4 font-bold">Safeguarding concern: guardian notifications were withheld. Follow your safeguarding procedure.</p>}
          {Array.isArray(r.evidence) && r.evidence.length > 0 && <div className="mb-4 border-l-2 border-role-care pl-4"><h4 className="mb-2 text-sm font-bold">From shared responses</h4>
            {r.evidence.map((e, i) => typeof e === "object" && e !== null && !Array.isArray(e) && typeof e.quote === "string"
              ? <blockquote key={i} className="mb-2 italic">“{e.quote}”</blockquote> : null)}</div>}
          <p className="mb-5"><strong>Suggested next step:</strong> {r.suggested_action}</p>
          {r.acknowledged_at ? <p className="flex items-center gap-2 text-sm font-bold text-role-care"><ShieldCheck className="size-4" aria-hidden /> Acknowledged by care staff</p>
            : r.completed_at && <ActionForm action={acknowledgeReview} label="Acknowledge review"><input type="hidden" name="id" value={r.id} /></ActionForm>}
        </article>)}
      </section>}
      {role !== "care" && data.patients.filter((p) => (!p.is_minor && p.user_id === data.userId) || data.links.some((l) => l.patient_id === p.id && l.is_guardian)).map((p) =>
        <ConsentControl key={p.id} id={p.id} name={p.nickname} enabled={data.permissions.find((w) => w.patient_id === p.id)?.enabled ?? false} />)}
      {role !== "care" && <section className={panelClass}>
        <h2 className="mb-4 text-xl font-extrabold">{isChild ? "Make it yours" : "Your preferences"}</h2>
        <ActionForm action={saveNotificationPrefs} label="Save preference">
          <label className="flex min-h-14 items-center gap-3"><input className="size-5 accent-primary" type="checkbox" name="connection_enabled" value="yes" defaultChecked={data.connectionEnabled} />
            {isChild ? "Send me little ideas for connecting" : "Send me personalized connection prompts"}</label>
          {!isChild && <p className="text-sm text-muted-foreground">Support alerts remain available even when connection prompts are off.</p>}
          {role === "family" && <p className="text-sm font-bold">Daily wellbeing reviews use AI (Mistral). You can turn this off anytime.</p>}
        </ActionForm>
      </section>}
      {!data.patients.length && <p className={panelClass}>Your space is ready. Your care team can help link your family.</p>}
  </section>;
}
