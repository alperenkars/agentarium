import { Avatar } from "./Avatar";
import { avatarOptions } from "./avatars.mjs";

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend>Avatar</legend>
      <div className="avatar-picker">
        {avatarOptions.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            aria-label={`Choose ${avatar.name}`}
            aria-pressed={value === avatar.id}
            className={value === avatar.id ? "chosen" : ""}
            onClick={() => onChange(avatar.id)}
          >
            <Avatar avatarId={avatar.id} size={100} />
            <span>{avatar.name}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
