# Agentarium

**Watch your agents grow.**

GitHub records how code changed. Agentarium explains how an agent evolved.

Agentarium sits above GitHub and other development systems. It turns meaningful changes in an agent's capabilities, tools, integrations, knowledge, and behavior into a clear visual history. It is not a feed of every commit. It shows the changes that matter.

## Product principle

**Agentarium must be plain, useful, and easy to understand.**

We will avoid long AI-generated text, AI-generated-looking graphics, neon effects, visual noise, and features added only because they are fashionable. The product should not look or sound like the current wave of AI software.

Every screen, sentence, icon, and interaction should earn its place. Language should be short and human. Graphics should be simple and functional. Important information should be visible without explanation.

## Screen whitelist

The interface is a game first. Only the following belong on screen:

- Yard: scenery, avatars, names, an actual latest milestone on hover, search,
  pause, navigation, add, and page controls when necessary.
- Agent list: avatars, names, actual latest milestones, search, and add.
- Agent profile: avatar, name, role, history, milestone and avatar controls.
- Evolution: plain-language proposed updates with date, short explanation,
  approve/edit/dismiss controls and collapsed Evidence. Only approved updates
  enter History. Find updates and a collapsed review record support this flow.
- Tracking: collapsed by default; repository, folder, branch scope, sync time,
  date-range import, branch-at-scan filter, sync/connection controls, folder
  backup/restore, saved-history recovery and expandable commit/import evidence.
  Short incomplete/unverified states appear only when applicable.
- Menu: export and artwork credits.
- Forms: field labels, inputs, save/cancel, and actionable errors.

Everything else stays out until explicitly approved. No ambient slogans,
onboarding paragraphs, decorative labels, fabricated progress, empty thought
bubbles, or tag interfaces. Existing tag data is retained for compatibility,
but new agents start without tags and search uses names only. Technical limits
and architectural explanations belong in documentation, not persistent UI copy.

We will stay away from the zeitgeist where we can and return to the clarity of older, simpler software: calm, direct, dependable, and easy to use.

## Agent appearance

Agents have simple, recognizable shapes. Names accompany every avatar, and shape distinguishes agents alongside color. Expressions stay quiet and friendly. Appearance conveys identity; health and capability claims require their own evidence.

The home page is a colorful pixel-art world that fills the window, like entering a familiar game town. Each character type has its own silhouette, outfit, and accessories. Gentle movement gives the place life. Controls sit over the world; the agent map stays available as a practical browsing view. Playfulness belongs in the scene; navigation and writing stay simple. Bombom is a reference for this sense of place and character, with original artwork for Agentarium.

## Explicit source views and agent work summary

User-requested capability cards, source-backed provider/channel filters and local
source roster controls may appear in profiles and navigation. Source, test and
live evidence remain distinct. Existing user profiles and history are preserved.

The Özet navigation and profile shortcut open an agent selector with mapped Jira /
PR work, review requests, current-head CI problems, source read dates and a
suggested next step. Approved milestones remain separate from work status. Counts
describe exact mapped records, never a complete backlog. Saved reads, missing
connections and unknown checks stay visible. This read-only screen does not post
to Slack or change Jira / GitHub.
