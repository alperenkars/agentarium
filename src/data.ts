import type { Agent } from "./model";
export const seed: Agent[] = [
  {
    id: "milo",
    name: "Milo",
    role: "Customer care",
    shape: 0,
    color: "#b9cbb0",
    tags: ["Northstar", "Retail", "Support"],
    milestones: [
      {
        id: "m3",
        date: "2026-09-21",
        kind: "Integration",
        title: "Can now look up orders",
        description:
          "Connects to the store catalog and order history to answer delivery questions.",
      },
      {
        id: "m2",
        date: "2026-09-12",
        kind: "Knowledge",
        title: "Learned the returns policy",
        description:
          "Answers questions about return windows, conditions, and refunds.",
      },
      {
        id: "m1",
        date: "2026-09-02",
        kind: "Capability",
        title: "First conversation",
        description: "Started helping customers with common store questions.",
      },
    ],
  },
  {
    id: "fern",
    name: "Fern",
    role: "Personal shopping",
    shape: 1,
    color: "#d8bbaa",
    tags: ["Northstar", "Retail", "Sales"],
    milestones: [
      {
        id: "f2",
        date: "2026-09-19",
        kind: "Capability",
        title: "Finds the right size",
        description:
          "Uses the product size guide to help shoppers compare measurements.",
      },
      {
        id: "f1",
        date: "2026-09-05",
        kind: "Knowledge",
        title: "Met the autumn collection",
        description: "Added the new collection and its product details.",
      },
    ],
  },
  {
    id: "otto",
    name: "Otto",
    role: "Appointment assistant",
    shape: 2,
    color: "#b8c8d5",
    tags: ["Daylight", "Healthcare", "Scheduling"],
    milestones: [
      {
        id: "o2",
        date: "2026-09-18",
        kind: "Integration",
        title: "Calendar connected",
        description:
          "Can check available appointment times in the team calendar.",
      },
      {
        id: "o1",
        date: "2026-09-07",
        kind: "Safety",
        title: "Confirms before booking",
        description:
          "Asks the caller to confirm the date and time before creating an appointment.",
      },
    ],
  },
  {
    id: "pip",
    name: "Pip",
    role: "Internal knowledge",
    shape: 3,
    color: "#e0d099",
    tags: ["Daylight", "Operations"],
    milestones: [
      {
        id: "p1",
        date: "2026-09-16",
        kind: "Knowledge",
        title: "Handbook refreshed",
        description:
          "Updated the handbook source with this month’s team policies.",
      },
    ],
  },
  {
    id: "alma",
    name: "Alma",
    role: "Travel companion",
    shape: 4,
    color: "#c9bfd3",
    tags: ["Wayfarer", "Travel", "Support"],
    milestones: [
      {
        id: "a1",
        date: "2026-09-14",
        kind: "Improvement",
        title: "Clearer travel suggestions",
        description: "Asks about travel dates before suggesting destinations.",
      },
    ],
  },
  {
    id: "remy",
    name: "Remy",
    role: "Developer assistant",
    shape: 5,
    color: "#d4c5b5",
    tags: ["Workshop", "Engineering"],
    milestones: [
      {
        id: "r1",
        date: "2026-09-10",
        kind: "Capability",
        title: "Explains pull requests",
        description:
          "Summarizes the intent and affected components of a pull request.",
      },
    ],
  },
];
