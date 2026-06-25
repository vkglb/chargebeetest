// A small "?" affordance that reveals a help bubble on hover / focus. Used next
// to form-field labels to explain what a field does.
export default function HelpTip({ text }: { text: string }) {
  return (
    <span className="help-tip" tabIndex={0} role="note" aria-label={text}>
      ?<span className="help-bubble">{text}</span>
    </span>
  );
}
