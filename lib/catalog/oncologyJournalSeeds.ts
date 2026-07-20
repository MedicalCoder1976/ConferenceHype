import type { OncologyJournal } from "@/lib/types";

type JournalSeed = Omit<OncologyJournal, "id" | "enabled" | "lastIssueKey">;

export const oncologyJournalSeeds: JournalSeed[] = [
  {
    name: "The Lancet Oncology",
    abbreviation: "Lancet Oncology",
    rssUrl: "https://www.thelancet.com/rssfeed/lanonc_current.xml",
    officialUrl: "https://www.thelancet.com/journals/lanonc/home",
    specialty: "Oncology"
  },
  {
    name: "The Lancet Haematology",
    abbreviation: "Lancet Haematology",
    rssUrl: "https://www.thelancet.com/rssfeed/lanhae_current.xml",
    officialUrl: "https://www.thelancet.com/journals/lanhae/home",
    specialty: "Hematology"
  },
  {
    name: "The New England Journal of Medicine",
    abbreviation: "NEJM",
    rssUrl: "https://www.nejm.org/action/showFeed?type=etoc&feed=rss&jc=nejm",
    officialUrl: "https://www.nejm.org/",
    specialty: "Internal Medicine"
  },
  {
    name: "Journal of Clinical Oncology",
    abbreviation: "JCO",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=jco",
    officialUrl: "https://ascopubs.org/journal/jco",
    specialty: "Oncology"
  },
  {
    name: "JAMA",
    abbreviation: "JAMA",
    rssUrl: "https://jamanetwork.com/rss/site_3/67.xml",
    officialUrl: "https://jamanetwork.com/journals/jama",
    specialty: "Internal Medicine"
  },
  {
    name: "Nature Medicine",
    abbreviation: "Nature Medicine",
    rssUrl: "https://www.nature.com/nm.rss",
    officialUrl: "https://www.nature.com/nm/",
    specialty: "Internal Medicine"
  },
  {
    name: "Nature Cancer",
    abbreviation: "Nature Cancer",
    rssUrl: "https://feeds.nature.com/natcancer/rss/current",
    officialUrl: "https://www.nature.com/natcancer/",
    specialty: "Oncology"
  },
  {
    name: "British Journal of Cancer",
    abbreviation: "BJC",
    rssUrl: "https://www.nature.com/bjc.rss",
    officialUrl: "https://www.nature.com/bjc/",
    specialty: "Oncology"
  },
  {
    name: "Leukemia",
    abbreviation: "Leukemia",
    rssUrl: "https://www.nature.com/leu.rss",
    officialUrl: "https://www.nature.com/leu/",
    specialty: "Hematology"
  },
  {
    name: "Blood Cancer Journal",
    abbreviation: "BCJ",
    rssUrl: "https://www.nature.com/bcj.rss",
    officialUrl: "https://www.nature.com/bcj/",
    specialty: "Hematology"
  },
  {
    name: "Annals of Oncology",
    abbreviation: "Annals Oncology",
    rssUrl: "https://www.annalsofoncology.org/current.rss",
    officialUrl: "https://www.annalsofoncology.org/",
    specialty: "Oncology"
  },
  {
    name: "The Lancet",
    abbreviation: "Lancet",
    rssUrl: "https://www.thelancet.com/rssfeed/lancet_current.xml",
    officialUrl: "https://www.thelancet.com/",
    specialty: "Internal Medicine"
  },

  // Internal Medicine
  {
    name: "PLOS Medicine",
    abbreviation: "PLOS Med",
    rssUrl: "https://journals.plos.org/plosmedicine/feed/atom",
    officialUrl: "https://journals.plos.org/plosmedicine/",
    specialty: "Internal Medicine"
  },
  {
    name: "The American Journal of Medicine",
    abbreviation: "Am J Med",
    rssUrl: "https://rss.sciencedirect.com/publication/science/00029343",
    officialUrl: "https://www.amjmed.com/",
    specialty: "Internal Medicine"
  },
  {
    name: "European Journal of Internal Medicine",
    abbreviation: "Eur J Intern Med",
    rssUrl: "https://rss.sciencedirect.com/publication/science/09536205",
    officialUrl: "https://www.ejinme.com/",
    specialty: "Internal Medicine"
  },
  {
    name: "Mayo Clinic Proceedings",
    abbreviation: "Mayo Clin Proc",
    rssUrl: "https://www.mayoclinicproceedings.org/current.rss",
    officialUrl: "https://www.mayoclinicproceedings.org/",
    specialty: "Internal Medicine"
  },

  // Oncology
  {
    name: "Nature Reviews Clinical Oncology",
    abbreviation: "Nat Rev Clin Oncol",
    rssUrl: "https://www.nature.com/nrclinonc.rss",
    officialUrl: "https://www.nature.com/nrclinonc/",
    specialty: "Oncology"
  },
  {
    name: "JCO Precision Oncology",
    abbreviation: "JCO Precis Oncol",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=po",
    officialUrl: "https://ascopubs.org/journal/po",
    specialty: "Oncology"
  },
  {
    name: "JCO Oncology Practice",
    abbreviation: "JCO Oncol Pract",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=op",
    officialUrl: "https://ascopubs.org/journal/op",
    specialty: "Oncology"
  },
  {
    name: "JCO Global Oncology",
    abbreviation: "JCO Glob Oncol",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=go",
    officialUrl: "https://ascopubs.org/journal/go",
    specialty: "Oncology"
  },
  {
    name: "JAMA Oncology",
    abbreviation: "JAMA Oncol",
    rssUrl: "https://jamanetwork.com/rss/site_159/174.xml",
    officialUrl: "https://jamanetwork.com/journals/jamaoncology",
    specialty: "Oncology"
  },

  // Hematology
  {
    name: "Bone Marrow Transplantation",
    abbreviation: "Bone Marrow Transplant",
    rssUrl: "https://www.nature.com/bmt.rss",
    officialUrl: "https://www.nature.com/bmt/",
    specialty: "Hematology"
  },

  // Cardiology
  {
    name: "The American Journal of Cardiology",
    abbreviation: "Am J Cardiol",
    rssUrl: "https://rss.sciencedirect.com/publication/science/00029149",
    officialUrl: "https://www.ajconline.org/",
    specialty: "Cardiology"
  },
  {
    name: "International Journal of Cardiology",
    abbreviation: "Int J Cardiol",
    rssUrl: "https://rss.sciencedirect.com/publication/science/01675273",
    officialUrl: "https://www.internationaljournalofcardiology.com/",
    specialty: "Cardiology"
  },
  {
    name: "Hypertension",
    abbreviation: "Hypertension",
    rssUrl: "https://www.ahajournals.org/action/showFeed?jc=hyp&type=etoc&feed=rss",
    officialUrl: "https://www.ahajournals.org/journal/hyp",
    specialty: "Cardiology"
  },
  {
    name: "Circulation Research",
    abbreviation: "Circ Res",
    rssUrl: "https://www.ahajournals.org/action/showFeed?jc=res&type=etoc&feed=rss",
    officialUrl: "https://www.ahajournals.org/journal/res",
    specialty: "Cardiology"
  },
  {
    name: "Heart",
    abbreviation: "Heart",
    rssUrl: "https://heart.bmj.com/rss/current.xml",
    officialUrl: "https://heart.bmj.com/",
    specialty: "Cardiology"
  },

  // Gastroenterology
  {
    name: "Gastrointestinal Endoscopy",
    abbreviation: "Gastrointest Endosc",
    rssUrl: "https://rss.sciencedirect.com/publication/science/00165107",
    officialUrl: "https://www.giejournal.org/",
    specialty: "Gastroenterology"
  },
  {
    name: "Journal of Hepatology",
    abbreviation: "J Hepatol",
    rssUrl: "https://rss.sciencedirect.com/publication/science/01688278",
    officialUrl: "https://www.journal-of-hepatology.eu/",
    specialty: "Gastroenterology"
  },
  {
    name: "Clinical Gastroenterology and Hepatology",
    abbreviation: "Clin Gastroenterol Hepatol",
    rssUrl: "https://rss.sciencedirect.com/publication/science/15423565",
    officialUrl: "https://www.cghjournal.org/",
    specialty: "Gastroenterology"
  },
  {
    name: "Gut",
    abbreviation: "Gut",
    rssUrl: "https://gut.bmj.com/rss/current.xml",
    officialUrl: "https://gut.bmj.com/",
    specialty: "Gastroenterology"
  },
  {
    name: "Nature Reviews Gastroenterology & Hepatology",
    abbreviation: "Nat Rev Gastroenterol Hepatol",
    rssUrl: "https://www.nature.com/nrgastro.rss",
    officialUrl: "https://www.nature.com/nrgastro/",
    specialty: "Gastroenterology"
  },

  // Rheumatology
  {
    name: "Nature Reviews Rheumatology",
    abbreviation: "Nat Rev Rheumatol",
    rssUrl: "https://www.nature.com/nrrheum.rss",
    officialUrl: "https://www.nature.com/nrrheum/",
    specialty: "Rheumatology"
  },
  {
    name: "Seminars in Arthritis and Rheumatism",
    abbreviation: "Semin Arthritis Rheum",
    rssUrl: "https://rss.sciencedirect.com/publication/science/00490172",
    officialUrl: "https://www.sciencedirect.com/journal/seminars-in-arthritis-and-rheumatism",
    specialty: "Rheumatology"
  },
  {
    name: "Annals of the Rheumatic Diseases",
    abbreviation: "Ann Rheum Dis",
    rssUrl: "https://ard.bmj.com/rss/current.xml",
    officialUrl: "https://ard.bmj.com/",
    specialty: "Rheumatology"
  },

  // Nephrology
  {
    name: "Kidney International",
    abbreviation: "Kidney Int",
    rssUrl: "https://www.kidney-international.org/current.rss",
    officialUrl: "https://www.kidney-international.org/",
    specialty: "Nephrology"
  },
  {
    name: "Nature Reviews Nephrology",
    abbreviation: "Nat Rev Nephrol",
    rssUrl: "https://www.nature.com/nrneph.rss",
    officialUrl: "https://www.nature.com/nrneph/",
    specialty: "Nephrology"
  },
  {
    name: "American Journal of Kidney Diseases",
    abbreviation: "Am J Kidney Dis",
    rssUrl: "https://www.ajkd.org/current.rss",
    officialUrl: "https://www.ajkd.org/",
    specialty: "Nephrology"
  },
  {
    name: "Kidney International Reports",
    abbreviation: "Kidney Int Rep",
    rssUrl: "https://www.kireports.org/current.rss",
    officialUrl: "https://www.kireports.org/",
    specialty: "Nephrology"
  },
  {
    name: "Seminars in Nephrology",
    abbreviation: "Semin Nephrol",
    rssUrl: "https://www.seminarsinnephrology.org/current.rss",
    officialUrl: "https://www.seminarsinnephrology.org/",
    specialty: "Nephrology"
  },
  {
    name: "Kidney Medicine",
    abbreviation: "Kidney Med",
    rssUrl: "https://www.kidneymedicinejournal.org/current.rss",
    officialUrl: "https://www.kidneymedicinejournal.org/",
    specialty: "Nephrology"
  },

  // Immunology
  {
    name: "Nature Immunology",
    abbreviation: "Nat Immunol",
    rssUrl: "https://www.nature.com/ni.rss",
    officialUrl: "https://www.nature.com/ni/",
    specialty: "Immunology"
  },
  {
    name: "Nature Reviews Immunology",
    abbreviation: "Nat Rev Immunol",
    rssUrl: "https://www.nature.com/nri.rss",
    officialUrl: "https://www.nature.com/nri/",
    specialty: "Immunology"
  },
  {
    name: "Mucosal Immunology",
    abbreviation: "Mucosal Immunol",
    rssUrl: "https://www.nature.com/mi.rss",
    officialUrl: "https://www.nature.com/mi/",
    specialty: "Immunology"
  },
  {
    name: "Immunity",
    abbreviation: "Immunity",
    rssUrl: "https://www.cell.com/immunity/current.rss",
    officialUrl: "https://www.cell.com/immunity/home",
    specialty: "Immunology"
  },
  {
    name: "Journal of Allergy and Clinical Immunology",
    abbreviation: "JACI",
    rssUrl: "https://www.jacionline.org/current.rss",
    officialUrl: "https://www.jacionline.org/",
    specialty: "Immunology"
  },
  {
    name: "Frontiers in Immunology",
    abbreviation: "Front Immunol",
    rssUrl: "https://www.frontiersin.org/journals/immunology/rss",
    officialUrl: "https://www.frontiersin.org/journals/immunology",
    specialty: "Immunology"
  },
  {
    name: "Trends in Immunology",
    abbreviation: "Trends Immunol",
    rssUrl: "https://www.cell.com/trends/immunology/current.rss",
    officialUrl: "https://www.cell.com/trends/immunology/home",
    specialty: "Immunology"
  },

  // Dermatology
  {
    name: "Journal of the American Academy of Dermatology",
    abbreviation: "J Am Acad Dermatol",
    rssUrl: "https://www.jaad.org/current.rss",
    officialUrl: "https://www.jaad.org/",
    specialty: "Dermatology"
  },
  {
    name: "JAMA Dermatology",
    abbreviation: "JAMA Dermatol",
    rssUrl: "https://jamanetwork.com/rss/site_12/68.xml",
    officialUrl: "https://jamanetwork.com/journals/jamadermatology",
    specialty: "Dermatology"
  },
  {
    name: "Journal of Investigative Dermatology",
    abbreviation: "JID",
    rssUrl: "https://www.jidonline.org/current.rss",
    officialUrl: "https://www.jidonline.org/",
    specialty: "Dermatology"
  },
  {
    name: "Journal of the European Academy of Dermatology and Venereology",
    abbreviation: "JEADV",
    rssUrl: "https://onlinelibrary.wiley.com/feed/14683083/most-recent",
    officialUrl: "https://onlinelibrary.wiley.com/journal/14683083",
    specialty: "Dermatology"
  },
  {
    name: "International Journal of Dermatology",
    abbreviation: "Int J Dermatol",
    rssUrl: "https://onlinelibrary.wiley.com/feed/13654632/most-recent",
    officialUrl: "https://onlinelibrary.wiley.com/journal/13654632",
    specialty: "Dermatology"
  },
  {
    name: "Experimental Dermatology",
    abbreviation: "Exp Dermatol",
    rssUrl: "https://onlinelibrary.wiley.com/feed/16000625/most-recent",
    officialUrl: "https://onlinelibrary.wiley.com/journal/16000625",
    specialty: "Dermatology"
  },
  {
    name: "Contact Dermatitis",
    abbreviation: "Contact Dermatitis",
    rssUrl: "https://onlinelibrary.wiley.com/feed/16000536/most-recent",
    officialUrl: "https://onlinelibrary.wiley.com/journal/16000536",
    specialty: "Dermatology"
  },
  {
    name: "Pediatric Dermatology",
    abbreviation: "Pediatr Dermatol",
    rssUrl: "https://onlinelibrary.wiley.com/feed/15251470/most-recent",
    officialUrl: "https://onlinelibrary.wiley.com/journal/15251470",
    specialty: "Dermatology"
  },
  {
    name: "Skin Research and Technology",
    abbreviation: "Skin Res Technol",
    rssUrl: "https://onlinelibrary.wiley.com/feed/16000846/most-recent",
    officialUrl: "https://onlinelibrary.wiley.com/journal/16000846",
    specialty: "Dermatology"
  },

  // ObGyn
  {
    name: "American Journal of Obstetrics & Gynecology",
    abbreviation: "AJOG",
    rssUrl: "https://www.ajog.org/current.rss",
    officialUrl: "https://www.ajog.org/",
    specialty: "ObGyn"
  },
  {
    name: "Fertility and Sterility",
    abbreviation: "Fertil Steril",
    rssUrl: "https://www.fertstert.org/current.rss",
    officialUrl: "https://www.fertstert.org/",
    specialty: "ObGyn"
  },
  {
    name: "BJOG: An International Journal of Obstetrics & Gynaecology",
    abbreviation: "BJOG",
    rssUrl: "https://obgyn.onlinelibrary.wiley.com/feed/14710528/most-recent",
    officialUrl: "https://obgyn.onlinelibrary.wiley.com/journal/14710528",
    specialty: "ObGyn"
  },
  {
    name: "Ultrasound in Obstetrics & Gynecology",
    abbreviation: "UOG",
    rssUrl: "https://obgyn.onlinelibrary.wiley.com/feed/14690705/most-recent",
    officialUrl: "https://obgyn.onlinelibrary.wiley.com/journal/14690705",
    specialty: "ObGyn"
  },
  {
    name: "International Journal of Gynecology & Obstetrics",
    abbreviation: "IJGO",
    rssUrl: "https://obgyn.onlinelibrary.wiley.com/feed/18793479/most-recent",
    officialUrl: "https://obgyn.onlinelibrary.wiley.com/journal/18793479",
    specialty: "ObGyn"
  },
  {
    name: "American Journal of Obstetrics & Gynecology MFM",
    abbreviation: "AJOG MFM",
    rssUrl: "https://www.ajogmfm.org/current.rss",
    officialUrl: "https://www.ajogmfm.org/",
    specialty: "ObGyn"
  },
  {
    name: "Journal of Minimally Invasive Gynecology",
    abbreviation: "JMIG",
    rssUrl: "https://www.jmig.org/current.rss",
    officialUrl: "https://www.jmig.org/",
    specialty: "ObGyn"
  },
  {
    name: "Contraception",
    abbreviation: "Contraception",
    rssUrl: "https://www.contraceptionjournal.org/current.rss",
    officialUrl: "https://www.contraceptionjournal.org/",
    specialty: "ObGyn"
  },
  {
    name: "Obstetrics and Gynecology Clinics of North America",
    abbreviation: "Obstet Gynecol Clin North Am",
    rssUrl: "https://www.obgyn.theclinics.com/current.rss",
    officialUrl: "https://www.obgyn.theclinics.com/",
    specialty: "ObGyn"
  },
  {
    name: "Journal of Obstetrics and Gynaecology Canada",
    abbreviation: "JOGC",
    rssUrl: "https://www.jogc.com/current.rss",
    officialUrl: "https://www.jogc.com/",
    specialty: "ObGyn"
  },

  // Gyn Onc
  {
    name: "Gynecologic Oncology",
    abbreviation: "Gynecol Oncol",
    rssUrl: "https://www.gynecologiconcology-online.net/current.rss",
    officialUrl: "https://www.gynecologiconcology-online.net/",
    specialty: "Gyn Onc"
  },

  // Radiology / Radiation Oncology
  {
    name: "International Journal of Radiation Oncology Biology Physics",
    abbreviation: "Red Journal",
    rssUrl: "https://www.redjournal.org/current.rss",
    officialUrl: "https://www.redjournal.org/",
    specialty: "Radiology / Radiation Oncology"
  },
  {
    name: "European Journal of Radiology",
    abbreviation: "Eur J Radiol",
    rssUrl: "https://www.ejradiology.com/current.rss",
    officialUrl: "https://www.ejradiology.com/",
    specialty: "Radiology / Radiation Oncology"
  },
  {
    name: "Radiotherapy and Oncology",
    abbreviation: "Green Journal (Rad Onc)",
    rssUrl: "https://www.thegreenjournal.com/current.rss",
    officialUrl: "https://www.thegreenjournal.com/",
    specialty: "Radiology / Radiation Oncology"
  },
  {
    name: "Practical Radiation Oncology",
    abbreviation: "Pract Radiat Oncol",
    rssUrl: "https://www.practicalradonc.org/current.rss",
    officialUrl: "https://www.practicalradonc.org/",
    specialty: "Radiology / Radiation Oncology"
  },
  {
    name: "Advances in Radiation Oncology",
    abbreviation: "Adv Radiat Oncol",
    rssUrl: "https://www.advancesradonc.org/current.rss",
    officialUrl: "https://www.advancesradonc.org/",
    specialty: "Radiology / Radiation Oncology"
  },
  {
    name: "Clinical Oncology",
    abbreviation: "Clin Oncol (R Coll Radiol)",
    rssUrl: "https://www.clinicaloncologyonline.net/current.rss",
    officialUrl: "https://www.clinicaloncologyonline.net/",
    specialty: "Radiology / Radiation Oncology"
  },

  // Pediatric Oncology / Pediatrics
  {
    name: "Archives of Disease in Childhood",
    abbreviation: "Arch Dis Child",
    rssUrl: "https://adc.bmj.com/rss/current.xml",
    officialUrl: "https://adc.bmj.com/",
    specialty: "Pediatric Oncology / Pediatrics"
  },
  {
    name: "Pediatric Research",
    abbreviation: "Pediatr Res",
    rssUrl: "https://www.nature.com/pr.rss",
    officialUrl: "https://www.nature.com/pr/",
    specialty: "Pediatric Oncology / Pediatrics"
  },
  {
    name: "JAMA Pediatrics",
    abbreviation: "JAMA Pediatrics",
    rssUrl: "https://jamanetwork.com/rss/site_19/75.xml",
    officialUrl: "https://jamanetwork.com/journals/jamapediatrics",
    specialty: "Pediatric Oncology / Pediatrics"
  },

  // Surgery
  {
    name: "JAMA Surgery",
    abbreviation: "JAMA Surgery",
    rssUrl: "https://jamanetwork.com/rss/site_20/76.xml",
    officialUrl: "https://jamanetwork.com/journals/jamasurgery",
    specialty: "Surgery"
  },

  // Cardiothoracic Surgery
  {
    name: "The Journal of Thoracic and Cardiovascular Surgery",
    abbreviation: "JTCVS",
    rssUrl: "https://www.jtcvs.org/current.rss",
    officialUrl: "https://www.jtcvs.org/",
    specialty: "Cardiothoracic Surgery"
  },

  // Thoracic Surgery
  {
    name: "The Annals of Thoracic Surgery",
    abbreviation: "Ann Thorac Surg",
    rssUrl: "https://www.annalsthoracicsurgery.org/current.rss",
    officialUrl: "https://www.annalsthoracicsurgery.org/",
    specialty: "Thoracic Surgery"
  },

  // Surgical Subspecialties
  {
    name: "Journal of Vascular Surgery",
    abbreviation: "J Vasc Surg",
    rssUrl: "https://www.jvascsurg.org/current.rss",
    officialUrl: "https://www.jvascsurg.org/",
    specialty: "Surgical Subspecialties"
  },
  {
    name: "JAMA Otolaryngology–Head & Neck Surgery",
    abbreviation: "JAMA Otolaryngology",
    rssUrl: "https://jamanetwork.com/rss/site_18/74.xml",
    officialUrl: "https://jamanetwork.com/journals/jamaotolaryngology",
    specialty: "Surgical Subspecialties"
  },

  // Others
  {
    name: "Thorax",
    abbreviation: "Thorax",
    rssUrl: "https://thorax.bmj.com/rss/current.xml",
    officialUrl: "https://thorax.bmj.com/",
    specialty: "Others"
  },
  {
    name: "Journal of Neurology, Neurosurgery & Psychiatry",
    abbreviation: "J Neurol Neurosurg Psychiatry",
    rssUrl: "https://jnnp.bmj.com/rss/current.xml",
    officialUrl: "https://jnnp.bmj.com/",
    specialty: "Others"
  },
  {
    name: "Nature Reviews Neurology",
    abbreviation: "Nat Rev Neurol",
    rssUrl: "https://www.nature.com/nrneurol.rss",
    officialUrl: "https://www.nature.com/nrneurol/",
    specialty: "Others"
  },
  {
    name: "Nature Reviews Endocrinology",
    abbreviation: "Nat Rev Endocrinol",
    rssUrl: "https://www.nature.com/nrendo.rss",
    officialUrl: "https://www.nature.com/nrendo/",
    specialty: "Others"
  },
  {
    name: "British Journal of Ophthalmology",
    abbreviation: "Br J Ophthalmol",
    rssUrl: "https://bjo.bmj.com/rss/current.xml",
    officialUrl: "https://bjo.bmj.com/",
    specialty: "Others"
  },
  {
    name: "JAMA Neurology",
    abbreviation: "JAMA Neurology",
    rssUrl: "https://jamanetwork.com/rss/site_16/72.xml",
    officialUrl: "https://jamanetwork.com/journals/jamaneurology",
    specialty: "Others"
  },
  {
    name: "JAMA Psychiatry",
    abbreviation: "JAMA Psychiatry",
    rssUrl: "https://jamanetwork.com/rss/site_14/70.xml",
    officialUrl: "https://jamanetwork.com/journals/jamapsychiatry",
    specialty: "Others"
  },
  {
    name: "JAMA Ophthalmology",
    abbreviation: "JAMA Ophthalmology",
    rssUrl: "https://jamanetwork.com/rss/site_17/73.xml",
    officialUrl: "https://jamanetwork.com/journals/jamaophthalmology",
    specialty: "Others"
  },
  // Major PubMed-indexed flagship journals without a dependable publisher
  // feed in the current catalog. Their rssUrl intentionally points to an
  // exact PubMed [Journal] query; lib/jobs/ingest.ts recognizes these entries
  // and uses the serialized PubMed client instead of scraping the page.
  { name: "Blood", abbreviation: "Blood", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Blood%22%5BJournal%5D", officialUrl: "https://ashpublications.org/blood", specialty: "Hematology" },
  { name: "Circulation", abbreviation: "Circulation", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Circulation%22%5BJournal%5D", officialUrl: "https://www.ahajournals.org/journal/circ", specialty: "Cardiology" },
  { name: "Journal of the American College of Cardiology", abbreviation: "JACC", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22J+Am+Coll+Cardiol%22%5BJournal%5D", officialUrl: "https://www.jacc.org/", specialty: "Cardiology" },
  { name: "European Heart Journal", abbreviation: "Eur Heart J", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Eur+Heart+J%22%5BJournal%5D", officialUrl: "https://academic.oup.com/eurheartj", specialty: "Cardiology" },
  { name: "Gastroenterology", abbreviation: "Gastroenterology", rssUrl: "https://www.gastrojournal.org/current.rss", officialUrl: "https://www.gastrojournal.org/", specialty: "Gastroenterology" },
  { name: "Hepatology", abbreviation: "Hepatology", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Hepatology%22%5BJournal%5D", officialUrl: "https://journals.lww.com/hep/", specialty: "Gastroenterology" },
  { name: "Journal of the American Society of Nephrology", abbreviation: "JASN", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22J+Am+Soc+Nephrol%22%5BJournal%5D", officialUrl: "https://journals.lww.com/jasn/", specialty: "Nephrology" },
  { name: "Clinical Journal of the American Society of Nephrology", abbreviation: "CJASN", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Clin+J+Am+Soc+Nephrol%22%5BJournal%5D", officialUrl: "https://journals.lww.com/cjasn/", specialty: "Nephrology" },
  { name: "Radiology", abbreviation: "Radiology", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Radiology%22%5BJournal%5D", officialUrl: "https://pubs.rsna.org/journal/radiology", specialty: "Radiology / Radiation Oncology" },
  { name: "European Radiology", abbreviation: "Eur Radiol", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Eur+Radiol%22%5BJournal%5D", officialUrl: "https://link.springer.com/journal/330", specialty: "Radiology / Radiation Oncology" },
  { name: "Pediatrics", abbreviation: "Pediatrics", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Pediatrics%22%5BJournal%5D", officialUrl: "https://publications.aap.org/pediatrics", specialty: "Pediatric Oncology / Pediatrics" },
  { name: "Annals of Surgery", abbreviation: "Ann Surg", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Ann+Surg%22%5BJournal%5D", officialUrl: "https://journals.lww.com/annalsofsurgery/", specialty: "Surgery" },
  { name: "Obstetrics & Gynecology", abbreviation: "Obstet Gynecol", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Obstet+Gynecol%22%5BJournal%5D", officialUrl: "https://journals.lww.com/greenjournal/", specialty: "ObGyn" },
  { name: "Arthritis & Rheumatology", abbreviation: "Arthritis Rheumatol", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Arthritis+Rheumatol%22%5BJournal%5D", officialUrl: "https://acrjournals.onlinelibrary.wiley.com/journal/23265205", specialty: "Rheumatology" },
  { name: "Neurology", abbreviation: "Neurology", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Neurology%22%5BJournal%5D", officialUrl: "https://www.neurology.org/", specialty: "Others" },
  { name: "BMJ", abbreviation: "BMJ", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22BMJ%22%5BJournal%5D", officialUrl: "https://www.bmj.com/", specialty: "Internal Medicine" },
  { name: "JAMA Internal Medicine", abbreviation: "JAMA Intern Med", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22JAMA+Intern+Med%22%5BJournal%5D", officialUrl: "https://jamanetwork.com/journals/jamainternalmedicine", specialty: "Internal Medicine" },
  { name: "The Lancet Neurology", abbreviation: "Lancet Neurol", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Lancet+Neurol%22%5BJournal%5D", officialUrl: "https://www.thelancet.com/journals/laneur/home", specialty: "Others" },
  { name: "The Lancet Gastroenterology & Hepatology", abbreviation: "Lancet Gastroenterol Hepatol", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Lancet+Gastroenterol+Hepatol%22%5BJournal%5D", officialUrl: "https://www.thelancet.com/journals/langas/home", specialty: "Gastroenterology" },
  { name: "The Lancet Rheumatology", abbreviation: "Lancet Rheumatol", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Lancet+Rheumatol%22%5BJournal%5D", officialUrl: "https://www.thelancet.com/journals/lanrhe/home", specialty: "Rheumatology" },
  { name: "Cancer Discovery", abbreviation: "Cancer Discov", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Cancer+Discov%22%5BJournal%5D", officialUrl: "https://aacrjournals.org/cancerdiscovery", specialty: "Oncology" },
  { name: "Cancer Cell", abbreviation: "Cancer Cell", rssUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Cancer+Cell%22%5BJournal%5D", officialUrl: "https://www.cell.com/cancer-cell/home", specialty: "Oncology" }
];
