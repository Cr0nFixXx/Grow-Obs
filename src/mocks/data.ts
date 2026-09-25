/* =========================================================================
 *  Grow|Observer — Zentrale Mock-Daten (rein statisch, keine Backend-Logik)
 *  Alle Inhalte sind fiktiv, aber realistisch modelliert.
 * ========================================================================= */
import type {
  Strain, Breeder, SeedOffer, Product, WikiArticle, Comment, ForumThread, Conversation, Grow, HallEntry, NotificationItem, AIAgent, SoilRecipe, SocialPost,
} from "@/types/domain";

export const AVATARS = [
  "https://images.pexels.com/photos/14950779/pexels-photo-14950779.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/27544052/pexels-photo-27544052.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/30269649/pexels-photo-30269649.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/37272329/pexels-photo-37272329.png?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/6102841/pexels-photo-6102841.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/7717254/pexels-photo-7717254.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/6497112/pexels-photo-6497112.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/33799456/pexels-photo-33799456.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/6497114/pexels-photo-6497114.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
  "https://images.pexels.com/photos/35490803/pexels-photo-35490803.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=320&w=320",
];

export const PLANTS = [
  "https://images.pexels.com/photos/35996089/pexels-photo-35996089.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/1302883/pexels-photo-1302883.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/12642803/pexels-photo-12642803.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/1125255/pexels-photo-1125255.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/34952070/pexels-photo-34952070.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/16352841/pexels-photo-16352841.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/22064359/pexels-photo-22064359.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/1638073/pexels-photo-1638073.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
];

/* ----------------------------- Typen ----------------------------- */

/* ----------------------------- Aktueller Nutzer ----------------------------- */
export const currentUser = {
  name: "Max Grünfeld",
  handle: "@max_grows",
  avatar: AVATARS[4],
  level: 14,
  title: "Master Grower",
  grows: 6,
  harvests: 23,
  followers: 1284,
  telegram: true,
};

/* ----------------------------- Social Feed ----------------------------- */

export const socialPosts: SocialPost[] = [
  { id: "sp1", author: "Lena B.", handle: "@lena_grows", avatar: AVATARS[5], time: "vor 12 Min.", text: "Woche 7 Blüte – die Trichome werden langsam bernsteinfarben 🍯 Fast Harvest Time! Wer hat Tipps für den letzten Flush?", image: PLANTS[2], likes: 248, comments: 34, shares: 12, liked: true, tags: ["Blüte", "Harvest"] },
  { id: "sp2", author: "soilWizard", handle: "@soilwizard", avatar: AVATARS[3], time: "vor 1 Std.", text: "Mein No-Till-Bett läuft jetzt im 3. Zyklus. Das Mikrobiom ist GOLD wert 💚 Keine Bottled-Nutes mehr, nur Komposttee alle 2 Wochen.", image: PLANTS[0], likes: 512, comments: 67, shares: 45, tags: ["LivingSoil", "NoTill"] },
  { id: "sp3", author: "NebulaGrow", handle: "@nebula", avatar: AVATARS[1], time: "vor 3 Std.", text: "Neue LED getestet – 2,7 µmol/J Effizienz sind ein echter Gamechanger für die Stromrechnung ⚡ Wer fährt ähnliche Werte?", likes: 176, comments: 28, shares: 9, tags: ["LED", "Effizienz"] },
  { id: "sp4", author: "harvestHans", handle: "@harvest", avatar: AVATARS[2], time: "vor 5 Std.", text: "312 g von 2 Pflanzen in 1 m² 💪 Lemony Aroma, hart wie Stein. Der Cure läuft in Gläsern 🫙", image: PLANTS[5], likes: 389, comments: 52, shares: 23, tags: ["Ernte", "Showcase"] },
];

export const stories = [
  { id: "st0", name: "Deine Story", avatar: currentUser.avatar, isYou: true },
  { id: "st1", name: "Lena", avatar: AVATARS[5], isYou: false },
  { id: "st2", name: "soilWiz", avatar: AVATARS[3], isYou: false },
  { id: "st3", name: "Nebula", avatar: AVATARS[1], isYou: false },
  { id: "st4", name: "Hans", avatar: AVATARS[2], isYou: false },
  { id: "st5", name: "data", avatar: AVATARS[7], isYou: false },
];

export const suggestedGrowers = [
  { id: "sg1", name: "greenThumb_88", handle: "@greenthumb", avatar: AVATARS[0], followers: "2,1k", expertise: "Living Soil" },
  { id: "sg2", name: "leafLover", handle: "@leaflower", avatar: AVATARS[6], followers: "1,4k", expertise: "LST & Training" },
  { id: "sg3", name: "misterKush", handle: "@misterkush", avatar: AVATARS[8], followers: "3,8k", expertise: "Indica-Zucht" },
];

export const trendingTags = [
  { tag: "LivingSoil", posts: "1,2k" },
  { tag: "Harvest", posts: "980" },
  { tag: "LED", posts: "742" },
  { tag: "NoTill", posts: "531" },
  { tag: "LST", posts: "412" },
];

/* ----------------------------- Breeder ----------------------------- */
export const breeders: Breeder[] = [
  { id: "b1", name: "Royal Seed Co.", location: "Amsterdam, NL", founded: 2003, rating: 4.8, strains: 42, verified: true, logoColor: "leaf", bio: "Alt eingesessen und bekannt für robuste, ertragreiche Genetiken mit konstanter Keimrate.", avatar: AVATARS[2] },
  { id: "b2", name: "Hazy Genetics", location: "Barcelona, ES", founded: 2015, rating: 4.7, strains: 28, verified: true, logoColor: "info", bio: "Spezialisten für Sativa-dominante Haze-Kreuzungen und Terpen-Bomben.", avatar: AVATARS[1] },
  { id: "b3", name: "Soil & Soul Seeds", location: "Berlin, DE", founded: 2019, rating: 4.6, strains: 19, verified: true, logoColor: "soil", bio: "Bio-Zucht für Living-Soil-Grower. Fokus auf CBD-reiche Sorten.", avatar: AVATARS[6] },
  { id: "b4", name: "Dutch Passionista", location: "Eindhoven, NL", founded: 1998, rating: 4.9, strains: 55, verified: true, logoColor: "leaf", bio: "Pioniere der feminisierten und automatischen Samen. Labor-geprüft.", avatar: AVATARS[7] },
  { id: "b5", name: "The Botanist Guild", location: "Portland, US", founded: 2011, rating: 4.5, strains: 31, verified: false, logoColor: "warning", bio: "Kollektiv von Heimzüchtern. Seltene Heirloom-Genetiken.", avatar: AVATARS[8] },
  { id: "b6", name: "Northern Lights Breeding", location: "Oslo, NO", founded: 2007, rating: 4.7, strains: 24, verified: true, logoColor: "info", bio: "Kalt-tolerante Indica-Linien, perfekt für kühle Grow-Räume.", avatar: AVATARS[0] },
];

/* ----------------------------- Strains ----------------------------- */
export const strains: Strain[] = [
  { id: "s1", name: "Northern Haze", breeder: "Hazy Genetics", type: "Sativa", thc: 24, cbd: 0.4, flowering: 10, yield: "500–600 g/m²", difficulty: 3, rating: 4.7, reviews: 312, price: 68, tag: "Energetisch", color: "info", notes: "Kiefrige Zitrusnoten, langanhaltend euphorisch.", effects: ["Euphorisch", "Kreativ", "Fokus"] },
  { id: "s2", name: "OG Kushberry", breeder: "Royal Seed Co.", type: "Hybrid", thc: 22, cbd: 0.6, flowering: 8, yield: "450–550 g/m²", difficulty: 2, rating: 4.8, reviews: 540, price: 59, tag: "Ausgewogen", color: "leaf", notes: "Beeren-Sweetness trifft erdige Kraft. Klassiker.", effects: ["Entspannt", "Glücklich"] },
  { id: "s3", name: "Gorilla Glue #4", breeder: "Dutch Passionista", type: "Hybrid", thc: 27, cbd: 0.2, flowering: 9, yield: "550–650 g/m²", difficulty: 2, rating: 4.9, reviews: 889, price: 74, tag: "Klebrig", color: "soil", notes: "Extrem harzreich, diesel-erdiges Aroma.", effects: ["Stark", "Beruhigend"] },
  { id: "s4", name: "Critical Mass", breeder: "Northern Lights Breeding", type: "Indica", thc: 20, cbd: 0.8, flowering: 7, yield: "600–700 g/m²", difficulty: 1, rating: 4.6, reviews: 421, price: 49, tag: "Ertragreich", color: "leaf", notes: "Riesige Blüten, ideal für Anfänger.", effects: ["Schmerzstillend", "Schlaf"] },
  { id: "s5", name: "Blue Dream Machine", breeder: "The Botanist Guild", type: "Sativa", thc: 23, cbd: 0.5, flowering: 9, yield: "500–600 g/m²", difficulty: 2, rating: 4.7, reviews: 267, price: 64, tag: "Beere", color: "info", notes: "Süße Blaubeere, sanfter Sattel.", effects: ["Hebung", "Sanft"] },
  { id: "s6", name: "Purple Punch", breeder: "Soil & Soul Seeds", type: "Indica", thc: 19, cbd: 1.2, flowering: 8, yield: "400–500 g/m²", difficulty: 1, rating: 4.5, reviews: 198, price: 55, tag: "Desert", color: "soil", notes: "Traube-Backpulver, perfekt zum Entspannen.", effects: ["Sedierend", "Süß"] },
  { id: "s7", name: "Gelato 41", breeder: "Hazy Genetics", type: "Hybrid", thc: 25, cbd: 0.3, flowering: 9, yield: "450–550 g/m²", difficulty: 3, rating: 4.8, reviews: 612, price: 72, tag: "Dessert", color: "leaf", notes: "Cremiges Eis, hoher THC-Gehalt.", effects: ["Euphorisch", "Kreativ"] },
  { id: "s8", name: "Sour Dieselence", breeder: "Royal Seed Co.", type: "Sativa", thc: 24, cbd: 0.4, flowering: 11, yield: "500–600 g/m²", difficulty: 3, rating: 4.6, reviews: 301, price: 66, tag: "Diesel", color: "warning", notes: "Treibstoff-Scharf, lang anhaltend.", effects: ["Energetisch", "Fokus"] },
];

export const myStrainCollection: Strain[] = [
  strains[1], strains[2], strains[3], strains[5], strains[6],
];

/* ----------------------------- Seed-Shop Ticker ----------------------------- */
export const seedOffers: SeedOffer[] = [
  { id: "o1", strain: "Northern Haze", breeder: "Hazy Genetics", shop: "SeedHub", price: 54, oldPrice: 68, type: "Sativa", fem: true },
  { id: "o2", strain: "Gorilla Glue #4", breeder: "Dutch Passionista", shop: "GreenMail", price: 62, oldPrice: 74, type: "Hybrid", fem: true },
  { id: "o3", strain: "Critical Mass", breeder: "Northern Lights Breeding", shop: "SeedHub", price: 39, oldPrice: 49, type: "Indica", fem: true },
  { id: "o4", strain: "Purple Punch", breeder: "Soil & Soul Seeds", shop: "BotanicBay", price: 48, oldPrice: 55, type: "Indica", fem: true },
  { id: "o5", strain: "Blue Dream Machine", breeder: "The Botanist Guild", shop: "GreenMail", price: 55, oldPrice: 64, type: "Sativa", fem: false },
  { id: "o6", strain: "Gelato 41", breeder: "Hazy Genetics", shop: "SeedHub", price: 64, oldPrice: 72, type: "Hybrid", fem: true },
];

/* ----------------------------- Equipment / Marktplatz ----------------------------- */
export const categories = ["Alles", "Beleuchtung", "Zelt", "Lüftung", "Erde & Medium", "Dünger", "Messtechnik", "Zubehör"];

export const products: Product[] = [
  { id: "p1", name: "LED Grow Panel 480W", category: "Beleuchtung", brand: "PhytoMax", price: 349, rating: 4.8, reviews: 142, condition: "Neu", image: "leaf" },
  { id: "p2", name: "Growzelt 120×120×200", category: "Zelt", brand: "SecretTent", price: 129, rating: 4.6, reviews: 320, condition: "Wie neu", image: "soil" },
  { id: "p3", name: "Inline-Ventilator 200m³/h", category: "Lüftung", brand: "AirFlow", price: 89, rating: 4.7, reviews: 88, condition: "Neu", image: "info" },
  { id: "p4", name: "Living Soil Mix 50L", category: "Erde & Medium", brand: "Soil & Soul", price: 34, rating: 4.9, reviews: 211, condition: "Neu", image: "soil" },
  { id: "p5", name: "Bio-Dünger-Set Bloom", category: "Dünger", brand: "GreenNectar", price: 45, rating: 4.5, reviews: 96, condition: "Neu", image: "leaf" },
  { id: "p6", name: "pH/EC Kombi-Messgerät", category: "Messtechnik", brand: "AquaTest", price: 119, rating: 4.6, reviews: 64, condition: "Gebraucht", image: "info" },
  { id: "p7", name: "Bewässerungspumpe 2000L/h", category: "Zubehör", brand: "AquaFlow", price: 59, rating: 4.4, reviews: 51, condition: "Wie neu", image: "info" },
  { id: "p8", name: "CO₂-Beutel Boost", category: "Zubehör", brand: "ExhaleCo", price: 39, rating: 4.3, reviews: 39, condition: "Neu", image: "leaf" },
];

/* ----------------------------- Wiki ----------------------------- */
export const wikiCategories = ["Übersicht", "Genetik", "Anbaumedium", "Licht", "Ernährung", "Schädlinge", "Blüte", "Ernte & Trocknung"];

export const wikiArticles: WikiArticle[] = [
  {
    id: "w1", title: "Living Soil: Das Mikrobiom verstehen", category: "Anbaumedium", excerpt: "Wie ein lebendiges Bodensystem deine Pflanzen über Monate ohne Bottled-Nutes versorgt.", readMin: 8, author: "Lena B.", updated: "vor 3 Tagen", version: "v4.2", tags: ["Soil", "Mikrobiom", "No-Till"],
    body: [
      "Living Soil ist kein Substrat, sondern ein Ökosystem. Im Zentrum steht das Zusammenwirken von Bakterien, Pilzen, Nematoden und Regenwürmern, das Nährstoffe kontinuierlich pflanzenverfügbar macht.",
      "Ein gut etablierter Boden speichert Wasser wie ein Schwamm und reguliert den pH-Wert weitgehend selbst. Das Ziel: über mehrere Zyklen hinweg ohne mineralische Dünger auszukommen.",
      "Der Aufbau dauert. Die ersten 4–6 Wochen reift der Boden, bevor er sein volles Potenzial entfaltet. Wer geduldig ist, wird mit komplexen Terpenprofilen und geringeren Inputkosten belohnt.",
    ],
  },
  {
    id: "w2", title: "VPD: Dampdruckdefizit richtig lesen", category: "Licht", excerpt: "Temperatur und Luftfeuchtigkeit im Zusammenspiel – der wichtigste Umweltwert überhaupt.", readMin: 6, author: "Tom K.", updated: "vor 1 Woche", version: "v2.0", tags: ["Klima", "VPD", "Umwelt"],
    body: [
      "Das VPD beschreibt, wie stark die Luft Feuchtigkeit aus den Blättern „saugt“. Liegt es im Optimum, transpiriert die Pflanze gleichmäßig und nimmt Nährstoffe effizient auf.",
      "In der Veg fase sind 0.8–1.0 kPa ideal, in der Blüte 1.2–1.6 kPa. Zu niedrig → Pilzdruck, zu hoch → Welke und Nährstoffbrand.",
    ],
  },
  {
    id: "w3", title: "Defizienzen erkennen: Kalzium & Magnesium", category: "Ernährung", excerpt: "Die häufigsten Mangelerscheinungen visuell diagnostizieren – bevor es zu spät ist.", readMin: 5, author: "Sam P.", updated: "vor 2 Tagen", version: "v3.1", tags: ["Mangel", "CalMag", "Diagnose"],
    body: ["CalMag-Mängel zeigen sich oft als nekrotische Spitzen an jungen Blättern und verkrüppeltes Wachstum. Soft-Wasser und Reinstsubstrate sind typische Auslöser."],
  },
  {
    id: "w4", title: "Low-Stress-Training (LST) Grundlagen", category: "Genetik", excerpt: "Mit Bindfaden einen gleichmäßigen Baldachin formen und Erträge steigern.", readMin: 7, author: "Mira S.", updated: "vor 4 Tagen", version: "v2.4", tags: ["Training", "LST", "Canopy"],
    body: ["LST lenkt das Apikal-Dominanz-Hormon um. Durch sanftes Herabbinden der Hauptsprosse bekommen untere Äste mehr Licht und wachsen mit."],
  },
];

/* ----------------------------- Forum ----------------------------- */
export const forumSubs = ["r/GrowTagebuch", "r/LivingSoil", "r/Automatik", "r/Schädlinge", "r/DIY", "r/Erntezeit"];

export const forumThreads: ForumThread[] = [
  { id: "t1", title: "Erste Blüte mit Living Soil – das kann man so stehen lassen?", sub: "r/LivingSoil", author: "greenThumb_88", avatar: AVATARS[0], votes: 248, comments: 43, ago: "vor 2 Std.", excerpt: "Nach 4 Wochen No-Till laufen die Pflanzen besser als je zuvor. Hier mein Setup und erste Beobachtungen…", tag: "Diskussion", top: true },
  { id: "t2", title: "Thripserl-Befall früh erkannt – so habe ich reagiert", sub: "r/Schädlinge", author: "NebulaGrow", avatar: AVATARS[5], votes: 176, comments: 29, ago: "vor 5 Std.", excerpt: "Silberne Flecken an den Blättern, dann die kleinen schwarzen Tierchen entdeckt. Mein Aktionsplan…", tag: "Hilfe" },
  { id: "t3", title: "VPD-Tabelle zum Selberdrucken (PDF im Kommentar)", sub: "r/DIY", author: "dataGrower", avatar: AVATARS[7], votes: 512, comments: 61, ago: "vor 1 Tag", excerpt: "Habe eine saubere VPD-Tabelle für Veg & Blüte erstellt. Gerne Feedback, dann optimiere ich sie.", tag: "Ressource", top: true },
  { id: "t4", title: "Automaten im 18/6 – lohnt sich der Lichtwechsel?", sub: "r/Automatik", author: "blazeBotanist", avatar: AVATARS[1], votes: 93, comments: 18, ago: "vor 1 Tag", excerpt: "Diskussion: 20/4 vs. 18/6 bei Automatik. Was bringt wirklich mehr Ertrag?", tag: "Frage" },
  { id: "t5", title: "Ernte-Post: 312g von 2 Pflanzen in 1m² 💚", sub: "r/Erntezeit", author: "harvestHans", avatar: AVATARS[2], votes: 389, comments: 72, ago: "vor 2 Tagen", excerpt: "Trocken, getrimmt, eingemaischt. Hier die Zahlen und was ich nächstes Mal anders mache.", tag: "Showcase" },
];

export const sampleComments: Comment[] = [
  { id: "c1", author: "soilWizard", avatar: AVATARS[3], body: "Sieht fantastisch aus! Wie hoch war dein EC-Wert in der Blüte?", votes: 42, ago: "vor 1 Std.", replies: [
    { id: "c1a", author: "greenThumb_88", avatar: AVATARS[0], body: "Im Living Soil messe ich kaum EC – das Mikrobiom regelt das. Nur Komposttee alle 2 Wochen.", votes: 28, ago: "vor 45 Min." },
  ] },
  { id: "c2", author: "leafLover", avatar: AVATARS[6], body: "Das Blattwerk ist super gleichmäßig. LST?", votes: 19, ago: "vor 2 Std." },
  { id: "c3", author: "misterKush", avatar: AVATARS[8], body: "Welche Sorte ist das? Sieht nach Haze aus.", votes: 11, ago: "vor 3 Std." },
];

/* ----------------------------- Chat ----------------------------- */
export const conversations: Conversation[] = [
  {
    id: "cv1", name: "Lena B.", avatar: AVATARS[5], online: true, last: "Schick mir mal dein Rezept 🙏", time: "12:04", unread: 2,
    messages: [
      { id: "m1", from: "them", text: "Hey! Wie läuft deine Blüte?", time: "11:50" },
      { id: "m2", from: "me", text: "Sehr gut, Woche 6, die Trichome werden milchig 🌿", time: "11:52" },
      { id: "m3", from: "them", text: "Krass! Foto bitte 😍", time: "11:53" },
      { id: "m4", from: "me", text: "Kommt direkt. Dein Living-Soil-Rezept würde mir auch gefallen.", time: "12:02" },
      { id: "m5", from: "them", text: "Schick mir mal dein Rezept 🙏", time: "12:04" },
    ],
  },
  {
    id: "cv2", name: "Tom K.", avatar: AVATARS[1], online: true, last: "Tippt gerade…", time: "11:30", unread: 0,
    messages: [
      { id: "m1", from: "them", text: "Dein VPD lag heute Morgen zu hoch.", time: "11:20" },
      { id: "m2", from: "me", text: "Hab die Lüftung hochgefahren, danke für den Alert!", time: "11:25" },
      { id: "m3", from: "them", text: "Tippt gerade…", time: "11:30" },
    ],
  },
  { id: "cv3", name: "Grow-Crew", avatar: AVATARS[7], online: false, last: "Nebula: Samstag Harvest-Party?", time: "Gestern", unread: 5, messages: [] },
  { id: "cv4", name: "Sam P.", avatar: AVATARS[3], online: false, last: "CalMag hat geholfen 👍", time: "Mo", unread: 0, messages: [] },
];

/* ----------------------------- Grows ----------------------------- */
export const grows: Grow[] = [
  {
    id: "g1", name: "HazyDream · Run 03", strain: "Northern Haze", breeder: "Hazy Genetics", type: "Sativa", medium: "Living Soil (No-Till)", startDate: "2025-01-08", day: 64, totalDays: 98, phase: "Blüte", phaseIndex: 2, progress: 65, health: 94, cover: PLANTS[0], gallery: [PLANTS[0], PLANTS[5], PLANTS[2], PLANTS[6], PLANTS[1]], expectedYield: "320–380 g",
    phases: [
      { key: "germ", label: "Keimung", start: 0, end: 5, done: true },
      { key: "veg", label: "Vegetativ", start: 5, end: 35, done: true },
      { key: "flower", label: "Blüte", start: 35, end: 91, done: false },
      { key: "harvest", label: "Ernte", start: 91, end: 98, done: false },
    ],
    env: Array.from({ length: 12 }, (_, i) => ({
      day: 35 + i * 3, temp: +(24 + Math.sin(i / 2) * 1.6).toFixed(1), rh: +(52 + Math.cos(i / 2) * 4).toFixed(1), vpd: +(1.2 + Math.sin(i / 3) * 0.12).toFixed(2), ec: +(1.4 + i * 0.04).toFixed(2),
    })),
    logs: [
      { id: "l1", day: 64, date: "Heute", title: "Trichome milchig", text: "Erste Trichome werden trüb, ca. 5 % bernsteinfarben. Noch ~3 Wochen.", tag: "Beobachtung" },
      { id: "l2", day: 60, date: "vor 4 Tagen", title: "Komposttee gegossen", text: "2 ml/L Aminosäure-Komplex als Boost. PH stabil bei 6.3.", tag: "Dünger" },
      { id: "l3", day: 52, date: "vor 12 Tagen", title: "Defoliation Runde 2", text: "Unteres Blattwerk entfernt für besseren Airflow.", tag: "Training" },
    ],
  },
  {
    id: "g2", name: "GG4 · Basement", strain: "Gorilla Glue #4", breeder: "Dutch Passionista", type: "Hybrid", medium: "Kokos/Perlit 70/30", startDate: "2025-02-01", day: 28, totalDays: 84, phase: "Vegetativ", phaseIndex: 1, progress: 33, health: 88, cover: PLANTS[3], gallery: [PLANTS[3], PLANTS[7]], expectedYield: "260–320 g",
    phases: [
      { key: "germ", label: "Keimung", start: 0, end: 5, done: true },
      { key: "veg", label: "Vegetativ", start: 5, end: 35, done: false },
      { key: "flower", label: "Blüte", start: 35, end: 77, done: false },
      { key: "harvest", label: "Ernte", start: 77, end: 84, done: false },
    ],
    env: Array.from({ length: 8 }, (_, i) => ({ day: 14 + i * 2, temp: +(25 + Math.sin(i) * 1).toFixed(1), rh: +(64 + Math.cos(i) * 3).toFixed(1), vpd: +(0.9 + Math.sin(i / 2) * 0.1).toFixed(2), ec: +(1.1 + i * 0.03).toFixed(2) })),
    logs: [{ id: "l1", day: 28, date: "Heute", title: "LST fortgeführt", text: "Baldachin gleichmäßig, 8 Hauptäste angebunden.", tag: "Training" }],
  },
  {
    id: "g3", name: "Critical · Quick", strain: "Critical Mass", breeder: "Northern Lights Breeding", type: "Indica", medium: "Erde (BioBizz)", startDate: "2024-11-20", day: 84, totalDays: 84, phase: "Ernte", phaseIndex: 3, progress: 100, health: 97, cover: PLANTS[4], gallery: [PLANTS[4], PLANTS[1]], expectedYield: "410 g",
    phases: [
      { key: "germ", label: "Keimung", start: 0, end: 5, done: true },
      { key: "veg", label: "Vegetativ", start: 5, end: 28, done: true },
      { key: "flower", label: "Blüte", start: 28, end: 77, done: true },
      { key: "harvest", label: "Ernte", start: 77, end: 84, done: true },
    ],
    env: Array.from({ length: 10 }, (_, i) => ({ day: 20 + i * 6, temp: 24, rh: 55, vpd: 1.2, ec: 1.5 })),
    logs: [{ id: "l1", day: 84, date: "abgeschlossen", title: "Geerntet & am Trocknen", text: "410 g trocken geschätzt. 14 Tage Slow-Cure in Gläsern.", tag: "Ernte" }],
  },
];

/* ----------------------------- Hall of Fame ----------------------------- */
export const hallOfFame: HallEntry[] = [
  { id: "h1", title: "Living Soil Monster", grower: "soilWizard", avatar: AVATARS[3], strain: "Gorilla Glue #4", image: PLANTS[2], award: "Ernte des Monats", likes: 1843, comments: 142, aspect: "aspect-[4/5]" },
  { id: "h2", title: "Purple Canopy", grower: "harvestHans", avatar: AVATARS[2], strain: "Purple Punch", image: PLANTS[5], award: "Best Color", likes: 1290, comments: 98, aspect: "aspect-square" },
  { id: "h3", title: "Haze Tower 2m", grower: "NebulaGrow", avatar: AVATARS[5], strain: "Northern Haze", image: PLANTS[0], award: "Tallest Grow", likes: 2204, comments: 211, aspect: "aspect-[3/5]" },
  { id: "h4", title: "Frosty Buds", grower: "leafLover", avatar: AVATARS[6], strain: "Gelato 41", image: PLANTS[7], award: "Trichome King", likes: 1567, comments: 120, aspect: "aspect-square" },
  { id: "h5", title: "Auto Surprise", grower: "blazeBotanist", avatar: AVATARS[1], strain: "Blue Dream Machine", image: PLANTS[3], award: "Best Auto", likes: 980, comments: 64, aspect: "aspect-[4/5]" },
  { id: "h6", title: "No-Till Dream", grower: "dataGrower", avatar: AVATARS[7], strain: "Critical Mass", image: PLANTS[6], award: "Sustainability", likes: 1342, comments: 88, aspect: "aspect-square" },
];

/* ----------------------------- Notifications ----------------------------- */
export const notifications: NotificationItem[] = [
  { id: "n1", type: "ai", title: "KI-Ratgeber", body: "Deine VPD liegt heute außerhalb des Optimums. Vorschlag verfügbar.", time: "vor 5 Min.", read: false },
  { id: "n2", type: "task", title: "Nächster Task", body: "Komposttee für „HazyDream · Run 03“ vorbereiten.", time: "vor 1 Std.", read: false },
  { id: "n3", type: "shop", title: "Angebot", body: "Northern Haze jetzt 54 € statt 68 € bei SeedHub.", time: "vor 3 Std.", read: false },
  { id: "n4", type: "forum", title: "Neue Antwort", body: "soilWizard hat auf deinen Thread geantwortet.", time: "vor 5 Std.", read: true },
  { id: "n5", type: "grow", title: "Phasen-Update", body: "„GG4 · Basement“ ist in die Blüte gewechselt.", time: "gestern", read: true },
  { id: "n6", type: "system", title: "System", body: "Deine monatliche Verbrauchsübersicht ist bereit.", time: "vor 2 Tagen", read: true },
];

/* ----------------------------- AI Agents ----------------------------- */
export const aiAgents: AIAgent[] = [
  { id: "a1", name: "Grow Mentor", role: "Allround-Berater", desc: "Beantwortet alle Anbaufragen und hilft bei Entscheidungen.", color: "leaf", icon: "Sparkles", uses: 12400, rating: 4.9 },
  { id: "a2", name: "Mixture-of-Erd's", role: "Erdmischungs-Experte", desc: "Entwirft und vergleicht Living-Soil-Rezepte wie Code.", color: "soil", icon: "GitBranch", uses: 5600, rating: 4.8 },
  { id: "a3", name: "Klima-Wächter", role: "Umwelt & VPD", desc: "Überwacht Temperatur, Feuchte und VPD rund um die Uhr.", color: "info", icon: "Thermometer", uses: 8900, rating: 4.7 },
  { id: "a4", name: "Kosten-Optimierer", role: "Budget & Effizienz", desc: "Findet Einsparpotenziale bei Strom, Dünger und Equipment.", color: "warning", icon: "TrendingDown", uses: 3200, rating: 4.6 },
];

export const aiSuggestions = [
  "Wie optimiere ich meine VPD in der Blüte?",
  "Vergleiche Kokos vs. Living Soil für Anfänger",
  "Erstelle einen Düngeplan für Woche 6 Blüte",
  "Welche Sorte passt zu 1m² und 600W LED?",
];

/* ----------------------------- Mixture-of-Erd's Recipes ----------------------------- */
export const soilRecipes: SoilRecipe[] = [
  {
    id: "r1", name: "base-living-soil-v3", author: "soilWizard", avatar: AVATARS[3], stars: 412, forks: 88, contributors: 7, updated: "vor 2 Tagen", base: "main", diff: {},
    components: [
      { name: "Kompost", pct: 30, color: "soil" },
      { name: "Torf (blond)", pct: 25, color: "leaf" },
      { name: "Blähton", pct: 15, color: "info" },
      { name: "Perlit", pct: 10, color: "warning" },
      { name: "Wurmhumus", pct: 12, color: "leaf" },
      { name: "Biochar", pct: 8, color: "danger" },
    ],
    ec: 1.4, ph: 6.4,
  },
  {
    id: "r2", name: "frosty-coco-boost", author: "harvestHans", avatar: AVATARS[2], stars: 256, forks: 41, contributors: 4, updated: "vor 5 Tagen", base: "base-living-soil-v3",
    diff: { add: ["Kokos 20 %"], remove: ["Torf (blond)"] },
    components: [
      { name: "Kokos", pct: 20, color: "info" },
      { name: "Kompost", pct: 30, color: "soil" },
      { name: "Wurmhumus", pct: 12, color: "leaf" },
      { name: "Blähton", pct: 15, color: "info" },
      { name: "Perlit", pct: 15, color: "warning" },
      { name: "Biochar", pct: 8, color: "danger" },
    ],
    ec: 1.6, ph: 6.2,
  },
];

/* ----------------------------- Kostenrechner ----------------------------- */
export const costCalc = {
  defaults: { tentM2: 1.2, lightWatt: 480, lightHours: 18, weeks: 12, pricePerKwh: 0.38, soilLiters: 100, fertCost: 80 },
  suggestions: [
    { id: "o1", title: "Auf 12/12 umschalten", save: 28, icon: "Clock", desc: "Reduziert Beleuchtung in der Blüte um 6 h/Tag." },
    { id: "o2", title: "Effizientere LED (2.7 µmol/J)", save: 42, icon: "Lightbulb", desc: "Tausch gegen effizientere LED senkt Strombedarf." },
    { id: "o3", title: "Living Soil statt Bottled Nutes", save: 60, icon: "Leaf", desc: "Wiederverwendbares Substrat senkt Düngekosten." },
  ],
};

/* ----------------------------- Verbrauch (Zeitreihen) ----------------------------- */
export const consumptionSeries = Array.from({ length: 12 }, (_, i) => {
  const month = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][i];
  return {
    label: month,
    strom: Math.round(140 + Math.sin(i / 2) * 28 + i * 4),
    wasser: Math.round(90 + Math.cos(i / 2) * 18 + i * 2),
    kosten: Math.round(60 + Math.sin(i / 2) * 14 + i * 3),
  };
});

export const consumptionCompare = [
  { label: "Dein Ø", strom: 168, wasser: 102, kosten: 74 },
  { label: "Community Ø", strom: 214, wasser: 130, kosten: 96 },
];

/* ----------------------------- Grow-Simulation ----------------------------- */
export const forecastPhases = [
  { key: "germ", label: "Keimung", days: "Tag 0–5", color: "info", detail: "Feucht-warm, 22–26 °C" },
  { key: "veg", label: "Vegetativ", days: "Tag 5–35", color: "leaf", detail: "18/6 Licht, Aufbau" },
  { key: "flower", label: "Blüte", days: "Tag 35–84", color: "soil", detail: "12/12, Ertragsbildung" },
  { key: "harvest", label: "Ernte", days: "Tag 84–91", color: "warning", detail: "Trichom-Check, Cut" },
];

/* ----------------------------- Quick Stats / Dashboard ----------------------------- */
export const quickStats = [
  { id: "q1", label: "Aktive Grows", value: "2", num: 2, suffix: "", delta: "+1", trend: "up", icon: "Sprout", color: "leaf" },
  { id: "q2", label: "Offene Tasks", value: "5", num: 5, suffix: "", delta: "2 fällig", trend: "down", icon: "ListChecks", color: "warning" },
  { id: "q3", label: "Kosten / Monat", value: "168 €", num: 168, suffix: " €", delta: "-12 %", trend: "up", icon: "Euro", color: "info" },
  { id: "q4", label: "Ø Gesundheit", value: "94 %", num: 94, suffix: " %", delta: "+3 %", trend: "up", icon: "HeartPulse", color: "leaf" },
];

export const upcomingTasks = [
  { id: "tk1", title: "Komposttee ansetzen", grow: "HazyDream · Run 03", when: "Heute · 18:00", prio: "hoch", done: false },
  { id: "tk2", title: "VPD prüfen & nachjustieren", grow: "GG4 · Basement", when: "Heute · 20:00", prio: "mittel", done: false },
  { id: "tk3", title: "Defoliation Runde 2", grow: "HazyDream · Run 03", when: "Morgen", prio: "niedrig", done: false },
  { id: "tk4", title: "Trichome mikroskopieren", grow: "HazyDream · Run 03", when: "Sa", prio: "mittel", done: false },
];

export const activityFeed = [
  { id: "a1", who: "Du", avatar: currentUser.avatar, action: "hat einen Log-Eintrag zu", target: "HazyDream · Run 03", time: "vor 20 Min.", icon: "NotebookPen", color: "leaf" },
  { id: "a2", who: "Lena B.", avatar: AVATARS[5], action: "hat dein Rezept geforkt", target: "base-living-soil-v3", time: "vor 1 Std.", icon: "GitFork", color: "soil" },
  { id: "a3", who: "Tom K.", avatar: AVATARS[1], action: "hat einen Wiki-Artikel aktualisiert", target: "VPD verstehen", time: "vor 3 Std.", icon: "BookOpen", color: "info" },
  { id: "a4", who: "Du", avatar: currentUser.avatar, action: "hast einen Sortenvergleich gestartet", target: "GG4 vs. Critical", time: "gestern", icon: "Scale", color: "warning" },
];

export const climate = {
  temp: 24.6, rh: 54, vpd: 1.21, ec: 1.42, ph: 6.3, co2: 820,
  tempStatus: "optimal", rhStatus: "optimal", vpdStatus: "watch",
  forecast: [
    { day: "Mo", icon: "Sun", temp: 25 },
    { day: "Di", icon: "CloudSun", temp: 24 },
    { day: "Mi", icon: "Cloud", temp: 22 },
    { day: "Do", icon: "CloudSun", temp: 23 },
    { day: "Fr", icon: "Sun", temp: 26 },
  ],
};

/* ----------------------------- Reviews ----------------------------- */
export const reviews = [
  { id: "rv1", author: "greenThumb_88", avatar: AVATARS[0], rating: 5, time: "vor 2 Tagen", text: "Keimrate 100 %, extrem gleichmäßige Phänotypen. Klare Empfehlung!" },
  { id: "rv2", author: "leafLover", avatar: AVATARS[6], rating: 4, time: "vor 1 Woche", text: "Tolle Aromen, braucht aber etwas Erfahrung im Training." },
  { id: "rv3", author: "misterKush", avatar: AVATARS[8], rating: 5, time: "vor 3 Wochen", text: "Ertrag übertroffen, harzreich wie versprochen." },
];

export const ratingBreakdown = [
  { stars: 5, count: 412 },
  { stars: 4, count: 88 },
  { stars: 3, count: 14 },
  { stars: 2, count: 3 },
  { stars: 1, count: 1 },
];
