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
    specialty: "Breast cancer reporter",
    voiceGender: "female",
    voiceEnvKey: "VOICE_NOVA_QUINN",
    style: "high-energy breast oncology reporter tracking late-breaking abstracts, endocrine therapy, HER2, ADCs, immunotherapy combinations, survivorship, and patient-centered context"
  },
  {
    id: "kai-lennox",
    name: "Kai Lennox",
    specialty: "Lung cancer reporter",
    voiceGender: "male",
    voiceEnvKey: "VOICE_KAI_LENNOX",
    style: "fast-moving thoracic oncology reporter focused on NSCLC, small cell lung cancer, biomarkers, targeted therapy, immunotherapy, resistance, and room-by-room trial buzz"
  },
  {
    id: "diego-vale",
    name: "Diego Vale",
    specialty: "GU cancer reporter",
    voiceGender: "male",
    voiceEnvKey: "VOICE_DIEGO_VALE",
    style: "sharp GU oncology reporter covering prostate, kidney, bladder, testicular, antibody-drug conjugates, radioligands, perioperative therapy, and practice-changing session chatter"
  },
  {
    id: "amara-sol",
    name: "Amara Sol",
    specialty: "Gyn cancer reporter",
    voiceGender: "female",
    voiceEnvKey: "VOICE_AMARA_SOL",
    style: "confident gyn oncology reporter covering ovarian, cervical, endometrial, maintenance therapy, immunotherapy, ADCs, surgical context, and patient-impact angles"
  },
  {
    id: "miles-carter",
    name: "Miles Carter",
    specialty: "Skin cancer reporter",
    voiceGender: "male",
    voiceEnvKey: "VOICE_MILES_CARTER",
    style: "crisp melanoma and skin oncology reporter watching immunotherapy sequencing, targeted therapy, neoadjuvant data, toxicity management, and poster-floor reaction"
  },
  {
    id: "sofia-reyes",
    name: "Sofia Reyes",
    specialty: "Colorectal cancer reporter",
    voiceGender: "female",
    voiceEnvKey: "VOICE_SOFIA_REYES",
    style: "Latina high-hype colorectal reporter covering MSI-high disease, ctDNA, rectal cancer, liver metastases, perioperative strategy, and practical source-labeled takeaways"
  },
  {
    id: "benji-cross",
    name: "Benji Cross",
    specialty: "Upper GI and hepatobiliary cancer reporter",
    voiceGender: "male",
    voiceEnvKey: "VOICE_BENJI_CROSS",
    style: "focused upper GI and hepatobiliary reporter covering gastric, esophageal, pancreas, biliary tract, HCC, biomarkers, regional therapy, and trial-design nuance"
  },
  {
    id: "elena-park",
    name: "Elena Park",
    specialty: "CNS cancer reporter",
    voiceGender: "female",
    voiceEnvKey: "VOICE_ELENA_PARK",
    style: "careful CNS oncology reporter covering glioma, brain metastases, leptomeningeal disease, radiation combinations, neurologic endpoints, and cautious interpretation"
  },
  {
    id: "grant-ivey",
    name: "Grant Ivey",
    specialty: "Endocrine cancer reporter",
    voiceGender: "male",
    voiceEnvKey: "VOICE_GRANT_IVEY",
    style: "clear endocrine oncology reporter covering thyroid, adrenal, neuroendocrine tumors, molecular testing, radionuclide therapy, and rare-tumor signal checks"
  },
  {
    id: "talia-stone",
    name: "Talia Stone",
    specialty: "Soft tissue cancer reporter",
    voiceGender: "female",
    voiceEnvKey: "VOICE_TALIA_STONE",
    style: "sarcoma and soft tissue oncology reporter covering subtype-specific evidence, rare-disease trial design, targeted therapy, immunotherapy, and expert hallway context"
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
    style: "high-energy floor reporter tracking exhibitor activity, official poster-wall schedule, source-backed callouts, sponsor messages, and product showcases"
  }
];

export function getPersona(personaId: string) {
  return personas.find((persona) => persona.id === personaId) ?? personas[0];
}
