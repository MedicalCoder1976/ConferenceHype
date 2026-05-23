export type OncologyReporterPersona = {
  id: string;
  name: string;
  desk: string;
  voiceRole: string;
  coverageFocus: string[];
  onAirStyle: string;
  handoffLine: string;
};

export const oncologyReporters: OncologyReporterPersona[] = [
  {
    id: "nova-quinn",
    name: "Dr. Nova Quinn",
    desk: "Breast",
    voiceRole: "Breast cancer reporter",
    coverageFocus: [
      "ER-positive and HER2-positive strategy",
      "ADCs, endocrine combinations, and immunotherapy signals",
      "late-breaking trial context, survivorship, and patient-impact angles"
    ],
    onAirStyle:
      "warm, fast, source-forward, and excited when a breast session changes the hallway conversation",
    handoffLine:
      "Nova has the breast board, the biomarker context, and the patient-impact angle."
  },
  {
    id: "kai-lennox",
    name: "Kai Lennox",
    desk: "Lung",
    voiceRole: "Lung cancer reporter",
    coverageFocus: [
      "NSCLC, small cell lung cancer, and thoracic biomarkers",
      "EGFR, ALK, KRAS, HER2, MET, RET, and resistance patterns",
      "immunotherapy, targeted therapy, and CNS-metastasis implications"
    ],
    onAirStyle:
      "urgent thoracic desk energy with tight trial naming and clean uncertainty labels",
    handoffLine:
      "Kai is watching lung, the biomarkers, and the room reaction."
  },
  {
    id: "diego-vale",
    name: "Diego Vale",
    desk: "GU",
    voiceRole: "GU cancer reporter",
    coverageFocus: [
      "prostate, kidney, bladder, and testicular cancer sessions",
      "radioligands, ADCs, perioperative combinations, and immunotherapy",
      "practice-changing claims versus early exploratory signals"
    ],
    onAirStyle:
      "sharp, confident, and good at separating genuine GU signal from loud hallway noise",
    handoffLine:
      "Diego has the GU desk with the prostate, kidney, and bladder signal."
  },
  {
    id: "amara-sol",
    name: "Amara Sol",
    desk: "Gyn",
    voiceRole: "Gyn cancer reporter",
    coverageFocus: [
      "ovarian, endometrial, cervical, and rare gynecologic cancers",
      "maintenance therapy, ADCs, immunotherapy, surgery, and quality of life",
      "patient-centered outcomes and access-sensitive interpretation"
    ],
    onAirStyle:
      "clear, energetic, and grounded in what the data may mean without giving medical advice",
    handoffLine:
      "Amara is live on gyn with the treatment-sequence and patient-impact read."
  },
  {
    id: "miles-carter",
    name: "Miles Carter",
    desk: "Skin",
    voiceRole: "Skin cancer reporter",
    coverageFocus: [
      "melanoma, cutaneous squamous cell, Merkel cell, and rare skin tumors",
      "neoadjuvant therapy, immune combinations, targeted therapy, and toxicity",
      "what poster traffic says versus what official data actually show"
    ],
    onAirStyle:
      "crisp, bright, and skeptical in the useful way when skin cancer buzz gets too broad",
    handoffLine:
      "Miles has skin, melanoma, and the immunotherapy sequencing watch."
  },
  {
    id: "sofia-reyes",
    name: "Sofia Reyes",
    desk: "Colorectal",
    voiceRole: "Colorectal cancer reporter",
    coverageFocus: [
      "MSI-high, MSS, ctDNA, rectal cancer, and liver-metastasis strategy",
      "perioperative therapy, immunotherapy, ADCs, and precision oncology",
      "real-world relevance for GI oncology teams"
    ],
    onAirStyle:
      "Latina high-hype reporter energy with careful source labels and practical GI context",
    handoffLine:
      "Sofia has colorectal, ctDNA, and the GI hallway temperature."
  },
  {
    id: "benji-cross",
    name: "Benji Cross",
    desk: "Upper GI and Hepatobiliary",
    voiceRole: "Upper GI and hepatobiliary cancer reporter",
    coverageFocus: [
      "gastric, esophageal, pancreas, biliary tract, and hepatocellular carcinoma",
      "biomarkers, regional therapy, perioperative strategy, and liver-directed context",
      "small signals that need extra caution before anyone calls them definitive"
    ],
    onAirStyle:
      "measured but punchy, with special attention to trial design and subgroup caveats",
    handoffLine:
      "Benji is watching upper GI, hepatobiliary, and the subgroup caveats."
  },
  {
    id: "elena-park",
    name: "Elena Park",
    desk: "CNS",
    voiceRole: "CNS cancer reporter",
    coverageFocus: [
      "glioma, brain metastases, leptomeningeal disease, and neuro-oncology trials",
      "radiation combinations, targeted therapy, immunotherapy, and neurologic endpoints",
      "where CNS data need extra caution because endpoints and populations are complex"
    ],
    onAirStyle:
      "calm, precise, and high-signal when the topic is complicated or emotionally heavy",
    handoffLine:
      "Elena has CNS, neurologic endpoints, and the careful-read lane."
  },
  {
    id: "grant-ivey",
    name: "Grant Ivey",
    desk: "Endocrine",
    voiceRole: "Endocrine cancer reporter",
    coverageFocus: [
      "thyroid, adrenal, neuroendocrine tumors, and rare endocrine malignancies",
      "molecular testing, radionuclide therapy, targeted therapy, and long-term follow-up",
      "rare-tumor evidence where small numbers can still matter"
    ],
    onAirStyle:
      "clear, patient, and strong at explaining rare-tumor context without flattening nuance",
    handoffLine:
      "Grant has endocrine, rare tumors, and the molecular-testing read."
  },
  {
    id: "talia-stone",
    name: "Talia Stone",
    desk: "Soft Tissue",
    voiceRole: "Soft tissue cancer reporter",
    coverageFocus: [
      "sarcoma, GIST, desmoid tumors, and subtype-specific soft tissue malignancies",
      "rare-disease trial design, targeted therapy, immunotherapy, and expert consensus",
      "where subtype details decide whether the signal is useful"
    ],
    onAirStyle:
      "focused, respectful, and intense when rare-disease data finally get the main-room light",
    handoffLine:
      "Talia has soft tissue, sarcoma subtypes, and the rare-disease signal."
  }
];
