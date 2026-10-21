export const avatarOptions = [
  {
    id: "huberthart-monk",
    name: "Monk",
    file: "Monk.png",
    artist: "Huberthart",
    kind: "sheet",
    fps: 6,
  },
  {
    id: "huberthart-hood",
    name: "Hood",
    file: "Hood.png",
    artist: "Huberthart",
    kind: "sheet",
    fps: 6,
  },
  ...["Ninja", "Knight", "Merchant", "Archer", "Student"].map((name) => ({
    id: `styloo-${name.toLowerCase()}`,
    name,
    file: name.toLowerCase(),
    artist: "Styloo",
    kind: "frames",
    fps: 10,
  })),
];

export function randomAvatar(random = Math.random) {
  return avatarOptions[Math.floor(random() * avatarOptions.length)].id;
}

export function avatarDefinition(id) {
  return avatarOptions.find((avatar) => avatar.id === id) || avatarOptions[0];
}

// Migrate older workspaces once, preserving every unrelated field and valid choice.
export function assignMissingAvatars(agents, random = Math.random) {
  return agents.map((agent) =>
    avatarOptions.some((avatar) => avatar.id === agent.avatarId)
      ? agent
      : { ...agent, avatarId: randomAvatar(random) },
  );
}
