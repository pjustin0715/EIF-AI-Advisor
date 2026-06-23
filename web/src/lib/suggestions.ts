export const ADVISOR_NAMES: Record<string, string> = {
  advisor1: "Data Dashboard Advisor",
  advisor2: "SSOT Memo Advisor",
  advisor3: "Data Modeling Advisor",
};

export interface Suggestion {
  label: string;
  query: string;
}

export const ADVISOR_GREETINGS: Record<string, string> = {
  advisor1: "Hi! Need help structuring or designing a data dashboard?",
  advisor2: "Hi! Want to create a Single Source of Truth memo or process documentation?",
  advisor3: "Hi! Need help building data models or star schemas?",
};

/** Curated starter prompts derived from EIF documentation and eval golden set. */
export const ADVISOR_SUGGESTIONS: Record<string, Suggestion[]> = {
  advisor1: [
    {
      label: "Dashboard structure",
      query:
        "How should I structure a decision-ready Looker Studio dashboard for regional sales data?",
    },
    {
      label: "KPI layout template",
      query: "What layout template should I use for a KPI dashboard?",
    },
    {
      label: "Stakeholder communication",
      query: "What tone should I use when writing to stakeholders?",
    },
  ],
  advisor2: [
    {
      label: "Interview guide for SSOT",
      query:
        "Help me build an interview guide to extract our onboarding process into an SSOT memo.",
    },
    {
      label: "SSOT memo sections",
      query: "What sections should an SSOT memo include?",
    },
    {
      label: "Process documentation",
      query:
        "How do I turn tribal knowledge into a single source of truth memo?",
    },
  ],
  advisor3: [
    {
      label: "Star schema modeling",
      query: "How do I model a star schema for e-commerce orders?",
    },
    {
      label: "Fact vs dimension tables",
      query: "When should I use a fact table versus a dimension table?",
    },
    {
      label: "Data modeling review",
      query: "What questions should I ask before finalizing a data model?",
    },
  ],
};

export function getSuggestions(advisorId: string): Suggestion[] {
  return ADVISOR_SUGGESTIONS[advisorId] ?? ADVISOR_SUGGESTIONS.advisor1;
}
