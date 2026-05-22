import type { Persona } from "@/lib/types";

export const personas: Persona[] = [
  {
    id: "echo-sage",
    name: "TumorCrusher",
    specialty: "Main conference anchor and daily agenda",
    voiceGender: "male",
    voiceEnvKey: "VOICE_ECHO_SAGE",
    style: "radio DJ-style conference hype anchor: upbeat, rhythmic, punchy, source-forward, and careful with uncertainty"
  },
  {
    id: "nova-quinn",
    name: "Nova Quinn",
    specialty: "Breast cancer and solid tumors",
    voiceGender: "female",
    voiceEnvKey: "VOICE_NOVA_QUINN",
    style: "warm expert commentator with restrained hype"
  },
  {
    id: "kai-lennox",
    name: "Kai Lennox",
    specialty: "Lung and thoracic oncology",
    voiceGender: "male",
    voiceEnvKey: "VOICE_KAI_LENNOX",
    style: "fast-moving reporter focused on trial and session buzz"
  },
  {
    id: "sage-harlan",
    name: "Sage Harlan",
    specialty: "Hematologic malignancies",
    voiceGender: "male",
    voiceEnvKey: "VOICE_SAGE_HARLAN",
    style: "measured commentator with clear uncertainty labels"
  },
  {
    id: "luna-vale",
    name: "Luna Vale",
    specialty: "Patient and community perspective",
    voiceGender: "female",
    voiceEnvKey: "VOICE_LUNA_VALE",
    style: "empathetic advocate voice without medical advice"
  },
  {
    id: "orion-reed",
    name: "Orion Reed",
    specialty: "Technology, AI, diagnostics, and innovation",
    voiceGender: "male",
    voiceEnvKey: "VOICE_ORION_REED",
    style: "curious technology correspondent"
  },
  {
    id: "riley-knox",
    name: "Riley Knox",
    specialty: "Policy, access, equity, and global oncology",
    voiceGender: "male",
    voiceEnvKey: "VOICE_RILEY_KNOX",
    style: "context-heavy policy reporter"
  },
  {
    id: "aether-vale",
    name: "Aether Vale",
    specialty: "Market and company-watch commentary",
    voiceGender: "male",
    voiceEnvKey: "VOICE_AETHER_VALE",
    style: "careful market desk commentator with no investment advice"
  },
  {
    id: "vesper-quill",
    name: "Vesper Quill",
    specialty: "Exhibitors, booths, industry floor, and product showcases",
    voiceGender: "female",
    voiceEnvKey: "VOICE_VESPER_QUILL",
    style: "high-energy floor reporter tracking exhibitor activity, poster-wall buzz, booth chatter, snacks, coffee, and product showcases"
  }
];

export function getPersona(personaId: string) {
  return personas.find((persona) => persona.id === personaId) ?? personas[0];
}
