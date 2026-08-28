const SPECIALTY_GUIDANCE: Record<string, string> = {
  Cardiology: "Cardiovascular testing, medication, and procedural decisions depend on symptoms, examination findings, comorbidities, and individual risk and should be reviewed with a cardiologist or qualified clinician.",
  Dermatology: "Skin findings cannot be diagnosed reliably from general information alone; changing lesions, severe rashes, or suspected skin cancer require an in-person dermatologic assessment.",
  "Emergency Medicine": "This episode cannot determine whether symptoms are an emergency. Seek immediate emergency care for severe, sudden, or rapidly worsening symptoms.",
  Endocrinology: "Hormone, diabetes, bone, and metabolic treatment decisions require individualized laboratory interpretation and clinical follow-up.",
  "Infectious Diseases": "Testing, antimicrobial selection, isolation, and vaccination decisions depend on the organism, exposure, resistance patterns, immune status, and local public-health guidance.",
  Neurology: "New weakness, speech difficulty, seizure, severe sudden headache, or altered consciousness may require emergency assessment rather than self-directed care.",
  Oncology: "Cancer treatment depends on tumor type, stage, biomarkers, prior therapy, overall health, and personal goals and should be planned with a qualified oncology team.",
  Pediatrics: "Children require age-, weight-, and development-specific assessment; caregivers should consult a qualified pediatric clinician before changing care.",
  Psychiatry: "Mental-health diagnosis and treatment require an individualized clinical assessment. Anyone at immediate risk of self-harm or harm to others should seek emergency help now.",
  Radiology: "Imaging findings must be interpreted in clinical context by qualified radiology and treating teams and should not be used alone for self-diagnosis.",
  Surgery: "Whether an operation is appropriate depends on diagnosis, anatomy, urgency, alternatives, operative risk, and informed discussion with a qualified surgeon.",
  Urology: "Urologic testing and treatment depend on symptoms, examination, imaging, laboratory findings, fertility considerations, and individual cancer risk."
};

function isGynecologicOncology(specialty: string, topics: string[]) {
  return specialty === "Gynecologic Oncology"
    || (["Obstetrics and Gynecology", "Oncology"].includes(specialty)
      && /gynecologic|gynaecologic|ovarian|endometrial|cervical|uterine|vulvar|vaginal|hpv/i.test(topics.join(" ")));
}

export function buildFiveThingsDisclaimer(specialty: string, topics: string[]) {
  if (isGynecologicOncology(specialty, topics)) {
    return {
      heading: "GYNECOLOGIC ONCOLOGY DISCLAIMER:",
      text: "Medical & Educational Disclaimer: This content is provided for educational and informational purposes only and is not a substitute for professional gynecologic oncology consultation or treatment. Gynecologic cancers require specialized evaluation and management by a qualified gynecologic oncologist or oncologic surgeon. The information presented reflects published research and clinical guidelines current as of 2026. This content should not be used for self-diagnosis, screening decisions, or treatment without consulting a gynecologic oncologist who has examined you and reviewed your medical history. Screening recommendations for HPV and cervical cancer vary by age and risk factors and should be discussed with your healthcare provider. Treatment decisions for ovarian, endometrial, or other gynecologic cancers are highly individualized and depend on cancer type, stage, molecular characteristics, your overall health, fertility status, and personal preferences. Genomic profiling and molecular testing are important components of modern gynecologic cancer care and should be discussed with your oncology team. If you have been diagnosed with a gynecologic cancer or have concerns about screening, consult with a gynecologic oncologist for personalized guidance."
    };
  }

  const guidance = SPECIALTY_GUIDANCE[specialty]
    ?? `${specialty} evaluation and treatment decisions are individualized and should be made with a qualified clinician who has reviewed the patient's history, examination, testing, risks, and preferences.`;
  return {
    heading: `${specialty.toUpperCase()} DISCLAIMER:`,
    text: `Medical & Educational Disclaimer: This content is provided for educational and informational purposes only and is not a substitute for professional ${specialty.toLowerCase()} consultation, diagnosis, or treatment. The information presented reflects published research and clinical guidance current as of 2026. It should not be used for self-diagnosis or to start, stop, or change screening, medication, testing, or treatment without consulting a qualified healthcare professional who has examined you and reviewed your medical history. ${guidance}`
  };
}

export function formatFiveThingsDisclaimer(specialty: string, topics: string[]) {
  const disclaimer = buildFiveThingsDisclaimer(specialty, topics);
  return `${disclaimer.heading}\n${disclaimer.text}`;
}
