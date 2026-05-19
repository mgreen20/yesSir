const skillLabel = (s) => {
  if (s <= 2) return "Novice";
  if (s <= 4) return "Casual";
  if (s <= 6) return "Skilled";
  if (s <= 8) return "Expert";
  return "Master";
};

export default function AvatarCard({ avatar, selected, disabled, picked, onClick }) {
  const className = [
    "avatar-card",
    selected && "selected",
    disabled && "disabled",
    picked && "picked",
  ].filter(Boolean).join(" ");

  return (
    <div className={className} onClick={onClick}>
      <div className="avatar-emoji">{avatar.emoji}</div>
      <div className="avatar-name">{avatar.name}</div>
      <div className="avatar-skill">
        <span className="skill-label">{skillLabel(avatar.skill)}</span>
        <div className="skill-bar">
          <div className="skill-fill" style={{ width: `${avatar.skill * 10}%` }} />
        </div>
      </div>
      {selected && <div className="avatar-check">&#10003;</div>}
    </div>
  );
}
